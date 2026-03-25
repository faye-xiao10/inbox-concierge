export interface FilterState {
  keyword: string;
  activeBucketIds: Set<number>;  // empty Set = all visible
  minConfidence: number;         // 0.0
  maxConfidence: number;         // 1.0
  minUrgency: number;            // 0.0
  nodeSizeMultiplier: number;    // 1.0
  textFadeZoom: number;          // 1.0 — zoom level at which labels appear
}

export const DEFAULT_FILTER_STATE: FilterState = {
  keyword: '',
  activeBucketIds: new Set(),
  minConfidence: 0,
  maxConfidence: 1,
  minUrgency: 0,
  nodeSizeMultiplier: 1,
  textFadeZoom: 1,
};
