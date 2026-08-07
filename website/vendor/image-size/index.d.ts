export interface ImageSize {
  width: number;
  height: number;
  type: string;
}

export function imageSize(input: Uint8Array): ImageSize;

declare const _default: typeof imageSize;
export default _default;
