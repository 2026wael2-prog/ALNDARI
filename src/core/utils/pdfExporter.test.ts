import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as JsPdfModule from 'jspdf';
import { computePageSlices, exportToPDF, type PageSlice } from './pdfExporter';

interface CapturedImage {
  pageIndex: number;
  offsetY: number;
  imageWidth: number;
  imageHeight: number;
}

interface CapturedFile {
  fileName: string;
  pageWidth: number;
  pageHeight: number;
  images: CapturedImage[];
}

const mocks = vi.hoisted(() => ({ capture: vi.fn(), files: [] as CapturedFile[] }));

vi.mock('html2canvas', () => ({ default: mocks.capture }));

vi.mock('jspdf', async importOriginal => {
  const { jsPDF: ActualPDF } = await importOriginal<typeof JsPdfModule>();
  return {
    jsPDF: vi.fn().mockImplementation((...args: ConstructorParameters<typeof ActualPDF>) => {
      const pdf = new ActualPDF(...args);
      const images: CapturedImage[] = [];
      let pageIndex = 0;

      pdf.addPage = vi.fn(() => {
        pageIndex += 1;
        return pdf;
      });

      pdf.addImage = vi.fn((...args2: unknown[]) => {
        const y = Number(args2[3]);
        const width = Number(args2[4]);
        const height = Number(args2[5]);
        images.push({ pageIndex, offsetY: y, imageWidth: width, imageHeight: height });
        return pdf;
      });

      pdf.save = vi.fn((fileName: string) => {
        mocks.files.push({
          fileName,
          pageWidth: pdf.internal.pageSize.getWidth(),
          pageHeight: pdf.internal.pageSize.getHeight(),
          images: [...images],
        });
        return pdf;
      }) as unknown as typeof pdf.save;

      return pdf;
    }),
  };
});

const captureOfHeightMm = (heightMm: number) => ({
  width: 2100,
  height: heightMm * 10,
  toDataURL: () => 'data:image/png;base64,test',
});

const firstFile = (): CapturedFile => {
  const [file] = mocks.files;
  return file;
};

const uniqueOffsets = (file: CapturedFile): number[] => [
  ...new Set(file.images.map(image => image.offsetY)),
];

describe('computePageSlices', () => {
  it('keeps short content on a single slice', () => {
    expect(computePageSlices(100, 297)).toEqual([{ sourceY: 0, sourceHeight: 100 }]);
  });

  it('returns no slices for empty content', () => {
    expect(computePageSlices(0, 297)).toEqual([]);
  });

  it('splits exact multiples into full pages', () => {
    expect(computePageSlices(594, 297)).toEqual([
      { sourceY: 0, sourceHeight: 297 },
      { sourceY: 297, sourceHeight: 297 },
    ]);
  });

  it('covers tall content exactly once across pages', () => {
    const slices = computePageSlices(800, 297);
    expect(slices).toHaveLength(3);
    expect(slices.reduce((sum, slice) => sum + slice.sourceHeight, 0)).toBeCloseTo(800, 6);
    let previous: PageSlice | undefined;
    slices.forEach(slice => {
      expect(slice.sourceHeight).toBeLessThanOrEqual(297.000001);
      if (previous !== undefined) {
        expect(slice.sourceY).toBeCloseTo(previous.sourceY + previous.sourceHeight, 6);
      }
      previous = slice;
    });
  });

  it('prefers the last boundary that still fits on the page', () => {
    expect(computePageSlices(800, 297, [250, 500, 620, 700])).toEqual([
      { sourceY: 0, sourceHeight: 250 },
      { sourceY: 250, sourceHeight: 250 },
      { sourceY: 500, sourceHeight: 200 },
      { sourceY: 700, sourceHeight: 100 },
    ]);
  });

  it('ignores boundaries outside the page or beyond the document', () => {
    expect(computePageSlices(400, 297, [0, -10, 297, 1200, Number.NaN])).toEqual([
      { sourceY: 0, sourceHeight: 297 },
      { sourceY: 297, sourceHeight: 103 },
    ]);
  });
});

describe('exportToPDF pagination', () => {
  beforeEach(() => {
    mocks.files.length = 0;
    mocks.capture.mockReset();
  });

  it('keeps content that fits inside one standard A4 page', async () => {
    mocks.capture.mockResolvedValue(captureOfHeightMm(280));

    await exportToPDF(document.createElement('div'), 'invoice');

    expect(mocks.files).toHaveLength(1);
    const file = firstFile();
    expect(file.fileName).toBe('invoice.pdf');
    expect(file.pageWidth).toBeCloseTo(210, 1);
    expect(file.pageHeight).toBeCloseTo(297, 1);
    expect(file.images).toHaveLength(1);
    const [image] = file.images;
    expect(image.pageIndex).toBe(0);
    expect(image.offsetY).toBe(0);
    expect(image.imageWidth).toBeCloseTo(210, 1);
    expect(image.imageHeight).toBeLessThanOrEqual(file.pageHeight);
  });

  it('fails loudly instead of saving a blank PDF for an empty capture', async () => {
    mocks.capture.mockResolvedValue(captureOfHeightMm(0));

    await expect(exportToPDF(document.createElement('div'), 'invoice')).rejects.toThrow(/empty/i);
    expect(mocks.files).toHaveLength(0);
  });

  it.each([300, 400, 800])(
    'paginates %s mm of content across standard pages without losing content',
    async heightMm => {
      mocks.capture.mockResolvedValue(captureOfHeightMm(heightMm));

      await exportToPDF(document.createElement('div'), 'invoice');

      expect(mocks.files).toHaveLength(1);
      const file = firstFile();
      const pageIndexes = [...new Set(file.images.map(image => image.pageIndex))];
      expect(pageIndexes).toHaveLength(Math.ceil(heightMm / 297 - 1e-6));
      expect(pageIndexes).toEqual(pageIndexes.map((_, index) => index));
      expect(file.pageWidth).toBeCloseTo(210, 1);
      expect(file.pageHeight).toBeCloseTo(297, 1);

      // Every page draws the full document shifted up, so each page shows its own window.
      file.images.forEach(image => {
        expect(image.imageWidth).toBeCloseTo(210, 1);
        expect(image.imageHeight).toBeCloseTo(heightMm, 1);
      });

      const offsets = uniqueOffsets(file);
      expect(offsets).toHaveLength(pageIndexes.length);
      const [firstOffset] = offsets;
      expect(firstOffset).toBe(0);
      offsets.slice(1).forEach(offset => {
        expect(offset).toBeLessThan(0);
      });
      // Consecutive windows are contiguous: no row falls between two pages.
      let previousOffset: number | undefined;
      offsets.forEach(offset => {
        if (previousOffset !== undefined) {
          expect(previousOffset - offset).toBeCloseTo(297, 1);
        }
        previousOffset = offset;
      });
    }
  );

  it('uses 1x CSS pixel width for DOM row breakpoints even when canvas scale is 2x', async () => {
    const root = document.createElement('div');
    const row = document.createElement('tr');
    root.appendChild(row);
    // 1x CSS layout: width=794px, height=1500px; row bottom at 1000px (~264.5mm on 210mm width)
    root.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 794, bottom: 1500, width: 794, height: 1500, x: 0, y: 0, toJSON: () => ({}) });
    row.getBoundingClientRect = () =>
      ({ top: 960, left: 0, right: 794, bottom: 1000, width: 794, height: 40, x: 0, y: 960, toJSON: () => ({}) });

    // 2x scaled canvas: 1588px x 3000px (~396.7mm tall)
    mocks.capture.mockResolvedValue({
      width: 1588,
      height: 3000,
      toDataURL: () => 'data:image/png;base64,test',
    });

    await exportToPDF(root, 'scaled-doc', { scale: 2 });

    const file = firstFile();
    expect(file.images).toHaveLength(2);
    // Page 2 must start at row bottom (~264.48mm), NOT at 132.24mm (half)!
    const expectedBreakMm = (1000 * 210) / 794;
    expect(file.images[1]?.offsetY).toBeCloseTo(-expectedBreakMm, 1);
  });

  it('ignores .no-print elements during html2canvas capture', async () => {
    mocks.capture.mockResolvedValue(captureOfHeightMm(150));

    await exportToPDF(document.createElement('div'), 'clean-doc');

    const captureOptions = mocks.capture.mock.calls[0]?.[1] as {
      ignoreElements?: (el: Element) => boolean;
    };
    expect(typeof captureOptions?.ignoreElements).toBe('function');
    const toolbar = document.createElement('div');
    toolbar.className = 'no-print';
    const content = document.createElement('div');
    expect(captureOptions.ignoreElements?.(toolbar)).toBe(true);
    expect(captureOptions.ignoreElements?.(content)).toBe(false);
  });
});
