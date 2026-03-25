'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { EmailNode } from '@/lib/inbox/get-graph-data';
import type { FilterState } from './filter-types';
import GraphTooltip from './graph-tooltip';
import { setupDragBehavior } from './drag-behavior';
import { urgencyToRadius, recencyToOpacity, tierToStroke, tierToStrokeWidth, computeClusterCentroids, computeFitTransform } from './graph-utils';

type SimNode = d3.SimulationNodeDatum & EmailNode;
type CircleSelection = d3.Selection<SVGCircleElement, SimNode, SVGGElement, unknown>;

interface EmailGraphProps {
  nodes: EmailNode[];
  width: number;
  height: number;
  filterState: FilterState;
  onReclassify?: (threadId: string, newBucketId: number) => void;
}

export default function EmailGraph({ nodes, width, height, filterState, onReclassify }: EmailGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltip, setTooltip] = useState<{ node: EmailNode | null; x: number; y: number; visible: boolean }>(
    { node: null, x: 0, y: 0, visible: false },
  );
  const simulationRef = useRef<d3.Simulation<SimNode, undefined> | null>(null);
  const circlesRef = useRef<CircleSelection | null>(null);
  const badgesRef = useRef<CircleSelection | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const nodeSizeMultiplierRef = useRef(filterState.nodeSizeMultiplier);

  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current).attr('width', width).attr('height', height);
  }, [width, height]);

  useEffect(() => {
    if (!svgRef.current || !gRef.current || nodes.length === 0) return;
    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);
    g.selectAll('*').remove();

    const xScale = d3.scaleLinear()
      .domain([d3.min(nodes, (d) => d.umapX)!, d3.max(nodes, (d) => d.umapX)!])
      .range([width * 0.2, width * 0.8]);
    const yScale = d3.scaleLinear()
      .domain([d3.min(nodes, (d) => d.umapY)!, d3.max(nodes, (d) => d.umapY)!])
      .range([height * 0.2, height * 0.8]);

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n, x: xScale(n.umapX), y: yScale(n.umapY) }));
    simNodesRef.current = simNodes;
    let centroids = computeClusterCentroids(simNodes);

    const bucketMeta = new Map<number, { name: string; color: string; count: number }>();
    for (const n of simNodes) {
      const m = bucketMeta.get(n.bucketId);
      if (m) m.count++;
      else bucketMeta.set(n.bucketId, { name: n.bucketName, color: n.bucketColor, count: 1 });
    }

    function forceCluster(alpha: number) {
      for (const node of simNodes) {
        const c = centroids.get(node.bucketId);
        if (!c) continue;
        const s = 0.35 * alpha * node.confidence;
        node.vx = (node.vx ?? 0) + (c.x - (node.x ?? 0)) * s;
        node.vy = (node.vy ?? 0) + (c.y - (node.y ?? 0)) * s;
      }
    }

    const simulation = d3.forceSimulation<SimNode>(simNodes)
      .force('cluster', forceCluster)
      .force('collide', d3.forceCollide<SimNode>((d) => urgencyToRadius(d.urgencyScore) * nodeSizeMultiplierRef.current + 2))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.02))
      .force('charge', d3.forceManyBody<SimNode>().strength(-8))
      .alphaDecay(0.03)
      .on('tick', ticked);
    simulationRef.current = simulation;

    const ringsG = g.append('g').attr('class', 'centroid-rings');
    const nodesG = g.append('g').attr('class', 'nodes');
    const labelsG = g.append('g').attr('class', 'cluster-labels');

    const circles = nodesG.selectAll<SVGCircleElement, SimNode>('circle.node')
      .data(simNodes).enter().append('circle').attr('class', 'node')
      .attr('r', (d) => urgencyToRadius(d.urgencyScore) * nodeSizeMultiplierRef.current)
      .attr('fill', (d) => d.bucketColor)
      .attr('fill-opacity', (d) => recencyToOpacity(d.timestamp))
      .attr('stroke', (d) => tierToStroke(d.classificationTier) ?? 'none')
      .attr('stroke-width', (d) => tierToStrokeWidth(d.classificationTier))
      .style('cursor', onReclassify ? 'grab' : 'pointer')
      .on('mouseover', (event: MouseEvent, d) => {
        if (hideTimeout.current) clearTimeout(hideTimeout.current);
        setTooltip({ node: d, x: event.clientX, y: event.clientY, visible: true });
      })
      .on('mouseout', () => {
        hideTimeout.current = setTimeout(() => setTooltip((p) => ({ ...p, visible: false })), 80);
      });
    circlesRef.current = circles;

    const secureNodes = simNodes.filter((d) => d.securityFlags.length > 0);
    const badges = nodesG.selectAll<SVGCircleElement, SimNode>('circle.badge')
      .data(secureNodes).enter().append('circle').attr('class', 'badge')
      .attr('r', 4).attr('fill', '#E53935').style('pointer-events', 'none');
    badgesRef.current = badges;

    labelsG.selectAll<SVGTextElement, [number, { name: string; color: string; count: number }]>('text')
      .data([...bucketMeta.entries()]).enter().append('text')
      .attr('text-anchor', 'middle').attr('font-size', '16px').attr('font-weight', '700')
      .attr('fill', '#1a1a2e').attr('stroke', 'rgba(255,255,255,0.9)').attr('stroke-width', '6')
      .attr('paint-order', 'stroke').attr('pointer-events', 'none').attr('opacity', 1)
      .text(([, m]) => `${m.name} (${m.count})`);

    function ticked() {
      centroids = computeClusterCentroids(simNodes);
      const mult = nodeSizeMultiplierRef.current;
      circles.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
      badges
        .attr('cx', (d) => (d.x ?? 0) + urgencyToRadius(d.urgencyScore) * mult)
        .attr('cy', (d) => (d.y ?? 0) - urgencyToRadius(d.urgencyScore) * mult);
      labelsG.selectAll<SVGTextElement, [number, { name: string; color: string; count: number }]>('text')
        .attr('x', ([bid]) => centroids.get(bid)?.x ?? 0)
        .attr('y', ([bid]) => (centroids.get(bid)?.y ?? 0) - 24);
    }

    if (onReclassify) {
      setupDragBehavior(
        simulation, circles, ringsG,
        () => {
          const c = computeClusterCentroids(simNodes);
          return new Map([...c].map(([bid, pos]) => [bid, { ...pos, color: bucketMeta.get(bid)?.color ?? '#888' }]));
        },
        onReclassify,
      );
    }

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 6])
      .on('zoom', (event) => { g.attr('transform', event.transform.toString()); });
    svg.call(zoom);

    simulation.on('end', () => {
      const { tx, ty, scale } = computeFitTransform(
        simNodes.map((n) => n.x ?? 0), simNodes.map((n) => n.y ?? 0), width, height,
      );
      svg.transition().duration(900).ease(d3.easeCubicOut)
        .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    });

    return () => {
      simulation.stop();
      svg.on('.zoom', null);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      simulationRef.current = null;
      circlesRef.current = null;
      badgesRef.current = null;
      simNodesRef.current = [];
    };
  }, [nodes, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const circles = circlesRef.current;
    const badges = badgesRef.current;
    const simNodes = simNodesRef.current;
    if (!circles || simNodes.length === 0) return;

    nodeSizeMultiplierRef.current = filterState.nodeSizeMultiplier;
    const { keyword, activeBucketIds, minConfidence, minUrgency, nodeSizeMultiplier } = filterState;
    const kw = keyword.toLowerCase();

    function passes(d: SimNode): boolean {
      if (kw && !`${d.subject} ${d.senderName} ${d.snippet}`.toLowerCase().includes(kw)) return false;
      if (activeBucketIds.size > 0 && !activeBucketIds.has(d.bucketId)) return false;
      if (d.confidence < minConfidence) return false;
      if (d.urgencyScore < minUrgency) return false;
      return true;
    }

    circles.transition().duration(200)
      .attr('fill-opacity', (d) => passes(d) ? recencyToOpacity(d.timestamp) : 0.05)
      .attr('stroke-opacity', (d) => passes(d) ? 1.0 : 0.1)
      .attr('r', (d) => urgencyToRadius(d.urgencyScore) * nodeSizeMultiplier);

    badges?.transition().duration(200)
      .attr('opacity', (d) => passes(d) ? 1.0 : 0.05);
  }, [filterState]);

  return (
    <div style={{ position: 'relative', width, height }}>
      <svg ref={svgRef} width={width} height={height}
        style={{ background: 'var(--bg-primary, #FAF5EE)', borderRadius: 8 }}>
        <g ref={gRef} />
      </svg>
      <GraphTooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} visible={tooltip.visible} />
    </div>
  );
}
