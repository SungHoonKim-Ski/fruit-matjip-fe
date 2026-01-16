// utils/image-compress.ts
type CompressOpts = {
  maxWidth: number;         // 최대 가로
  maxHeight: number;        // 최대 세로
  maxBytes: number;         // 목표 최대 바이트
  outputType: 'image/webp' | 'image/jpeg' | 'auto';
  quality: number;          // 시작 품질 (0~1)
  minQuality: number;       // 품질 하한
};

const DEFAULT_OPTS: CompressOpts = {
  maxWidth: 1600,
  maxHeight: 1600,
  maxBytes: 5 * 1024 * 1024, // 5MB
  outputType: 'auto',
  quality: 0.82,
  minQuality: 0.5,
};

const changeExt = (name: string, newExt: string) =>
  name.replace(/\.[^/.]+$/, '') + '.' + newExt;

const mimeToExt = (mime: string) =>
  mime === 'image/webp' ? 'webp'
    : mime === 'image/jpeg' ? 'jpg'
      : mime === 'image/png' ? 'png'
        : 'jpg';

const fit = (w: number, h: number, mw: number, mh: number) => {
  const r = Math.min(1, mw / w, mh / h);
  return { w: Math.max(1, Math.round(w * r)), h: Math.max(1, Math.round(h * r)) };
};

export async function compressImage(file: File, o: Partial<CompressOpts> = {}): Promise<File> {
  const opts = { ...DEFAULT_OPTS, ...o };

  // 이미지 로드(+ EXIF 회전 보정)
  const bitmap = await createImageBitmap(file as any, { imageOrientation: 'from-image' } as any);

  // 크기 조정
  const { w, h } = fit(bitmap.width, bitmap.height, opts.maxWidth, opts.maxHeight);

  const useOffscreen = typeof OffscreenCanvas !== 'undefined';
  const canvas: any = useOffscreen ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);

  // 출력 포맷 결정: 알파가 필요할 가능성이 있으면 webp, 아니면 jpeg
  let targetType = opts.outputType === 'auto'
    ? (file.type === 'image/png' ? 'image/webp' : 'image/jpeg')
    : opts.outputType;

  // 품질 내려가며 목표 용량 맞추기
  let q = opts.quality;
  let out: Blob | null = null;

  async function toBlob(quality: number, type: string) {
    if (useOffscreen && canvas.convertToBlob) {
      return await canvas.convertToBlob({ type, quality });
    }
    return await new Promise<Blob | null>(res => (canvas as HTMLCanvasElement).toBlob(res, type, quality));
  }

  while (q >= opts.minQuality) {
    out = await toBlob(q, targetType);
    if (out && out.size <= opts.maxBytes) break;
    q -= 0.08;
  }

  // 그래도 큰 경우: 마지막 결과 사용(혹은 타입 바꿔 재도전)
  if (!out) out = await toBlob(Math.max(opts.minQuality, 0.5), targetType) as Blob;

  const ext = mimeToExt(out!.type || targetType);
  const name = changeExt(file.name, ext);
  return new File([out!], name, { type: out!.type || targetType, lastModified: Date.now() });
}

// 1:1 비율로 중앙 크롭 후 압축 (칩 이미지용)
export async function compressImageSquare(file: File, targetSize: number = 200): Promise<File> {
  // 이미지 로드(+ EXIF 회전 보정)
  const bitmap = await createImageBitmap(file as any, { imageOrientation: 'from-image' } as any);

  // 정사각형 크롭 계산 (중앙 기준)
  const size = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - size) / 2;
  const sy = (bitmap.height - size) / 2;

  // 출력 크기 (최대 targetSize)
  const outputSize = Math.min(size, targetSize);

  const useOffscreen = typeof OffscreenCanvas !== 'undefined';
  const canvas: any = useOffscreen ? new OffscreenCanvas(outputSize, outputSize) : document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');

  // 중앙에서 정사각형으로 크롭하여 그리기
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, outputSize, outputSize);

  // webp로 압축 (작은 이미지이므로 용량 제한 완화)
  const targetType = 'image/webp';
  const maxBytes = 100 * 1024; // 100KB 목표
  let q = 0.85;
  let out: Blob | null = null;

  async function toBlob(quality: number, type: string) {
    if (useOffscreen && canvas.convertToBlob) {
      return await canvas.convertToBlob({ type, quality });
    }
    return await new Promise<Blob | null>(res => (canvas as HTMLCanvasElement).toBlob(res, type, quality));
  }

  while (q >= 0.4) {
    out = await toBlob(q, targetType);
    if (out && out.size <= maxBytes) break;
    q -= 0.1;
  }

  if (!out) out = await toBlob(0.4, targetType) as Blob;

  const ext = mimeToExt(out!.type || targetType);
  const name = changeExt(file.name, ext);
  return new File([out!], name, { type: out!.type || targetType, lastModified: Date.now() });
}