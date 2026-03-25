// Pure D3/TS — no React imports.
import * as d3 from 'd3';

export interface DragNode extends d3.SimulationNodeDatum {
  threadId: string;
  bucketId: number;
  bucketColor: string;
}

type RingDatum = { bucketId: number; color: string; x: number; y: number };

export function setupDragBehavior<N extends DragNode>(
  simulation: d3.Simulation<N, undefined>,
  circles: d3.Selection<SVGCircleElement, N, SVGGElement, unknown>,
  ringsG: d3.Selection<SVGGElement, unknown, any, any>, // parent type varies
  getCentroids: () => Map<number, { x: number; y: number; color: string }>,
  onDrop: (threadId: string, newBucketId: number) => void,
  snapRadius = 100,
): void {
  let originalBucket: number | null = null;
  let highlightedBucket: number | null = null;

  function clearRings() {
    ringsG.selectAll<SVGCircleElement, RingDatum>('circle.ring')
      .transition().duration(200)
      .attr('opacity', 0);
  }

  function pulseRing(bucketId: number) {
    const ring = ringsG.selectAll<SVGCircleElement, RingDatum>('circle.ring')
      .filter((d) => d.bucketId === bucketId);
    function step() {
      ring.transition().duration(200).attr('r', 34)
        .transition().duration(200).attr('r', 28)
        .on('end', step);
    }
    step();
  }

  const drag = d3.drag<SVGCircleElement, N>()
    .on('start', (event, d) => {
      originalBucket = d.bucketId;
      highlightedBucket = null;
      d.fx = d.x;
      d.fy = d.y;
      d3.select<SVGCircleElement, N>(event.sourceEvent.target as SVGCircleElement).raise();
      simulation.alphaTarget(0.1).restart();

      // Draw rings at current centroid positions
      const centroids = getCentroids();
      const ringData: RingDatum[] = [...centroids.entries()].map(([bid, pos]) => ({ bucketId: bid, color: pos.color, x: pos.x, y: pos.y }));
      ringsG.selectAll<SVGCircleElement, RingDatum>('circle.ring')
        .data(ringData, (r) => String(r.bucketId))
        .join('circle')
        .attr('class', 'ring')
        .attr('r', 28)
        .attr('fill', 'none')
        .attr('stroke', (r) => r.color)
        .attr('stroke-width', 2)
        .attr('opacity', 0)
        .attr('cx', (r) => r.x)
        .attr('cy', (r) => r.y)
        .attr('pointer-events', 'none');
    })
    .on('drag', (event, d) => {
      d.fx = event.x;
      d.fy = event.y;

      const centroids = getCentroids();
      let nearest: number | null = null;
      let nearestDist = snapRadius;

      for (const [bid, pos] of centroids) {
        if (bid === originalBucket) continue;
        const dx = pos.x - event.x;
        const dy = pos.y - event.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) { nearestDist = dist; nearest = bid; }
      }

      if (nearest !== highlightedBucket) {
        highlightedBucket = nearest;
        ringsG.selectAll<SVGCircleElement, RingDatum>('circle.ring')
          .interrupt()
          .transition().duration(150)
          .attr('opacity', (r) => r.bucketId === nearest ? 0.8 : 0)
          .attr('r', 28);
        if (nearest !== null) pulseRing(nearest);
      }
    })
    .on('end', (_event, d) => {
      simulation.alphaTarget(0);
      clearRings();

      if (highlightedBucket !== null) {
        const newBucketId = highlightedBucket;
        // Optimistic color update on the dragged node
        circles.filter((n) => n.threadId === d.threadId)
          .attr('fill', () => getCentroids().get(newBucketId)?.color ?? d.bucketColor);
        d.bucketId = newBucketId;
        d.fx = null;
        d.fy = null;
        onDrop(d.threadId, newBucketId);
      } else {
        d.fx = null;
        d.fy = null;
      }

      originalBucket = null;
      highlightedBucket = null;
    });

  circles.call(drag);
}
