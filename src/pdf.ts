/* A tiny, dependency-free PDF writer: wraps JPEG images in a PDF, one
   page per image, each page exactly matching its image's pixel dimensions. This keeps the
   exported PDF visually identical to the PNG while remaining a real document
   that WhatsApp (and anything else) can open. */

/** Decode the base64 payload of a `data:` URL into raw bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface PdfPage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

/** Build a one-page PDF (as bytes) that displays `jpeg` at `width`×`height`. */
export function jpegToPdf(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  return jpegsToPdf([{ jpeg, width, height }]);
}

/** Build a PDF with one page per JPEG, each page sized to its own image. */
export function jpegsToPdf(pages: readonly PdfPage[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [];

  const put = (data: string | Uint8Array): void => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (id: number, body: string): void => {
    offsets[id] = length;
    put(`${id} 0 obj\n${body}\nendobj\n`);
  };

  put("%PDF-1.3\n");

  // Objects: 1 catalog, 2 page tree, then page / image / content per page.
  const pageId = (i: number): number => 3 + i * 3;
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  pages.forEach(({ jpeg, width, height }, i) => {
    const id = pageId(i);
    obj(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`,
    );

    offsets[id + 1] = length;
    put(
      `${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${jpeg.length} >>\nstream\n`,
    );
    put(jpeg);
    put("\nendstream\nendobj\n");

    // Content stream: map the unit square to the page, then paint the image.
    const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(id + 2, `<< /Length ${content.length} >>\nstream\n${content}endstream`);
  });

  const xrefStart = length;
  const objCount = 3 + pages.length * 3; // free entry 0 plus every object
  let xref = `xref\n0 ${objCount}\n0000000000 65535 f \n`;
  for (let i = 1; i < objCount; i++) {
    const offset = offsets[i] ?? 0;
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  put(xref);
  put(`trailer\n<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
