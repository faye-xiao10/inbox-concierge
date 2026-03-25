'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { EmailNode } from '@/lib/inbox/get-graph-data';
import GraphTooltip from './graph-tooltip';
import {
  urgencyToRadius,
  recencyToOpacity,
  tierToStroke,
  tierToStrokeWidth,
  computeClusterCentroids,
  computeFitTransform,
} from './graph-utils';

type SimNode = d3.SimulationNodeDatum & EmailNode;

interface EmailGraphProps {
  nodes: EmailNode[];
  width: number;
  height: number;
}

export default function EmailGraph({ nodes, width, height }: EmailGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltip, setTooltip] = useState<{ node: EmailNode | null; x: number; y: number; visible: boolean }>(
    { node: null, x: 0, y: 0, visible: false },
  );

  useEffect(() => {
    if (!svgRef.current || !gRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);
    g.selectAll('*').remove();

    // A — Normalize UMAP coords to canvas space
    const xScale = d3.scaleLinear()
      .domain([d3.min(nodes, (d) => d.umapX)!, d3.max(nodes, (d) => d.umapX)!])
      .range([width * 0.3, width * 0.7]);
    const yScale = d3.scaleLinear()
      .domain([d3.min(nodes, (d) => d.umapY)!, d3.max(nodes, (d) => d.umapY)!])
      .range([height * 0.3, height * 0.7]);

    // B — Initialize simulation nodes
    const simNodes: SimNode[] = nodes.map((n) => ({
      ...n,
      x: xScale(n.umapX),
      y: yScale(n.umapY),
    }));

    // C — Compute initial cluster centroids
    let centroids = computeClusterCentroids(simNodes);

    // Custom cluster force
    function forceCluster(alpha: number) {
      for (const node of simNodes) {
        const c = centroids.get(node.bucketId);
        if (!c) continue;
        const strength = 0.15 * alpha * node.confidence;
        node.vx = (node.vx ?? 0) + (c.x - (node.x ?? 0)) * strength;
        node.vy = (node.vy ?? 0) + (c.y - (node.y ?? 0)) * strength;
      }
    }

    // D — Build simulation
    const simulation = d3.forceSimulation<SimNode>(simNodes)
      .force('cluster', forceCluster)
      .force('collide', d3.forceCollide<SimNode>((d) => urgencyToRadius(d.urgencyScore) + 2))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.02))
      .force('charge', d3.forceManyBody<SimNode>().strength(-8))
      .alphaDecay(0.03)
      .on('tick', ticked);

    // E — Render nodes (labels appended after so they paint on top)
    const nodesG = g.append('g').attr('class', 'nodes');
    const labelsG = g.append('g').attr('class', 'cluster-labels');

    const circles = nodesG.selectAll<SVGCircleElement, SimNode>('circle.node')
      .data(simNodes)
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('r', (d) => urgencyToRadius(d.urgencyScore))
      .attr('fill', (d) => d.bucketColor)
      .attr('fill-opacity', (d) => recencyToOpacity(d.timestamp))
      .attr('stroke', (d) => tierToStroke(d.classificationTier) ?? 'none')
      .attr('stroke-width', (d) => tierToStrokeWidth(d.classificationTier))
      .style('cursor', 'pointer')
      .on('mouseover', (event: MouseEvent, d) => {
        if (hideTimeout.current) clearTimeout(hideTimeout.current);
        setTooltip({ node: d, x: event.clientX, y: event.clientY, visible: true });
      })
      .on('mouseout', () => {
        hideTimeout.current = setTimeout(() => {
          setTooltip((prev) => ({ ...prev, visible: false }));
        }, 80);
      })
      .on('click', (_event: MouseEvent, d) => {
        console.log(d.threadId);
      });

    // Security badge overlays
    const secureNodes = simNodes.filter((d) => d.securityFlags.length > 0);
    const badges = nodesG.selectAll<SVGCircleElement, SimNode>('circle.badge')
      .data(secureNodes)
      .enter()
      .append('circle')
      .attr('class', 'badge')
      .attr('r', 4)
      .attr('fill', '#E53935')
      .style('pointer-events', 'none');

    // Cluster labels
    const bucketGroups = new Map<number, { name: string; color: string; count: number }>();
    for (const n of simNodes) {
      if (!bucketGroups.has(n.bucketId)) {
        bucketGroups.set(n.bucketId, { name: n.bucketName, color: n.bucketColor, count: 0 });
      }
      bucketGroups.get(n.bucketId)!.count += 1;
    }

    const labels = labelsG.selectAll<SVGTextElement, [number, { name: string; color: string; count: number }]>('text')
      .data([...bucketGroups.entries()])
      .enter()
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', '16px')
      .attr('font-weight', '700')
      .attr('fill', '#1a1a2e')
      .attr('stroke', 'rgba(255,255,255,0.9)')
      .attr('stroke-width', '6')
      .attr('paint-order', 'stroke')
      .attr('pointer-events', 'none')
      .text(([, meta]) => `${meta.name} (${meta.count})`);

    function ticked() {
      centroids = computeClusterCentroids(simNodes);

      circles
        .attr('cx', (d) => d.x ?? 0)
        .attr('cy', (d) => d.y ?? 0);

      badges
        .attr('cx', (d) => (d.x ?? 0) + urgencyToRadius(d.urgencyScore))
        .attr('cy', (d) => (d.y ?? 0) - urgencyToRadius(d.urgencyScore));

      labels.attr('x', ([bucketId]) => centroids.get(bucketId)?.x ?? 0)
        .attr('y', ([bucketId]) => (centroids.get(bucketId)?.y ?? 0) - 24);
    }

    // F — Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 6])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      });
    svg.call(zoom);

    // Fit all nodes into view once simulation settles
    simulation.on('end', () => {
      const { tx, ty, scale } = computeFitTransform(
        simNodes.map((n) => n.x ?? 0),
        simNodes.map((n) => n.y ?? 0),
        width, height,
      );
      svg.transition()
        .duration(900)
        .ease(d3.easeCubicOut)
        .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    });

    return () => {
      simulation.stop();
      svg.on('.zoom', null);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [nodes, width, height]);

  return (
    <div style={{ position: 'relative', width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ background: 'var(--bg-primary, #FAF5EE)', borderRadius: 8 }}
      >
        <g ref={gRef} />
      </svg>
      <GraphTooltip
        node={tooltip.node}
        x={tooltip.x}
        y={tooltip.y}
        visible={tooltip.visible}
      />
    </div>
  );
}
