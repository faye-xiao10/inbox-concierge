// Pure utility functions — no React or D3 imports.

export function urgencyToRadius(urgency: number): number {
  const clamped = Math.max(0, Math.min(1, urgency));
  return 6 + clamped * 14; // 6–20px
}

export function recencyToOpacity(timestamp: string): number {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const ageMs = now - then;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (ageMs <= 0) return 1.0;
  if (ageMs >= sevenDaysMs) return 0.3;
  return 1.0 - (0.7 * ageMs) / sevenDaysMs;
}

export function tierToStroke(tier: number): string | null {
  if (tier === 2) return '#F5C518';
  if (tier === 3) return '#E53935';
  return null;
}

export function tierToStrokeWidth(tier: number): number {
  if (tier === 2) return 2;
  if (tier === 3) return 3;
  return 0;
}

export function computeFitTransform(
  xs: number[],
  ys: number[],
  width: number,
  height: number,
): { tx: number; ty: number; scale: number } {
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bboxWidth = maxX - minX || 1;
  const bboxHeight = maxY - minY || 1;
  const pad = 80;
  const scale = Math.min((width - pad * 2) / bboxWidth, (height - pad * 2) / bboxHeight, 1.2);
  const tx = (width - bboxWidth * scale) / 2 - minX * scale;
  const ty = (height - bboxHeight * scale) / 2 - minY * scale;
  return { tx, ty, scale };
}

export function computeClusterCentroids(
  nodes: Array<{ bucketId: number; x?: number; y?: number }>,
): Map<number, { x: number; y: number }> {
  const sums = new Map<number, { sx: number; sy: number; count: number }>();
  for (const node of nodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const existing = sums.get(node.bucketId);
    if (existing) {
      existing.sx += x;
      existing.sy += y;
      existing.count += 1;
    } else {
      sums.set(node.bucketId, { sx: x, sy: y, count: 1 });
    }
  }
  const centroids = new Map<number, { x: number; y: number }>();
  for (const [bucketId, { sx, sy, count }] of sums) {
    centroids.set(bucketId, { x: sx / count, y: sy / count });
  }
  return centroids;
}
