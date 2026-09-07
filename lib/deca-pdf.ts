import { Buffer } from "node:buffer";
import * as QRCode from "qrcode";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 46;
const FOOTER_Y = 34;

export type DeCAGoodsLine = {
  sequence: number;
  description: string;
  packages?: number | null;
  packaging?: string | null;
  grossWeightKg?: number | null;
};

export type DeCANativePdfInput = {
  documentNumber: string;
  contractualShipper: {
    legalName: string;
    taxId: string;
    domicile: string;
  };
  effectiveCarrier: {
    legalName: string;
    taxId: string;
  };
  origin: string;
  destination: string;
  goodsDescription: string;
  grossWeightKg: number;
  packages?: number | null;
  packaging?: string | null;
  goodsLines?: DeCAGoodsLine[];
  transportDate: string;
  tractorRegistration: string;
  articulatedVehicle: boolean;
  trailerRegistration?: string | null;
  specialCirculationAuthorizationRequired: boolean;
  specialCirculationAuthorization?: string | null;
  observations?: string | null;
  publicUrl: string;
  createdAt: string;
  modifiedAt: string;
};

const cp1252Special = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);

function cleanText(value: string) {
  return value.replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function encodeWinAnsi(value: string) {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f || (codePoint >= 0xa0 && codePoint <= 0xff)) {
      bytes.push(codePoint);
      continue;
    }
    const mapped = cp1252Special.get(codePoint);
    if (mapped == null) {
      throw new Error(`El PDF DeCA contiene un carácter no representable en WinAnsi: ${character}`);
    }
    bytes.push(mapped);
  }
  return bytes;
}

function pdfHex(value: string) {
  return `<${encodeWinAnsi(value).map((byte) => byte.toString(16).padStart(2, "0")).join("")}>`;
}

function isValidIsoDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function asTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateDeCANativePdfInput(input: DeCANativePdfInput) {
  const errors: string[] = [];
  const requiredText: Array<[string, string]> = [
    ["documentNumber", input.documentNumber],
    ["contractualShipper.legalName", input.contractualShipper.legalName],
    ["contractualShipper.taxId", input.contractualShipper.taxId],
    ["contractualShipper.domicile", input.contractualShipper.domicile],
    ["effectiveCarrier.legalName", input.effectiveCarrier.legalName],
    ["effectiveCarrier.taxId", input.effectiveCarrier.taxId],
    ["origin", input.origin],
    ["destination", input.destination],
    ["goodsDescription", input.goodsDescription],
    ["tractorRegistration", input.tractorRegistration],
  ];

  for (const [field, value] of requiredText) {
    if (!cleanText(value)) errors.push(`${field} es obligatorio`);
  }
  if (!Number.isFinite(input.grossWeightKg) || input.grossWeightKg <= 0) {
    errors.push("grossWeightKg debe ser mayor que cero");
  }
  if (!isValidIsoDateOnly(input.transportDate)) errors.push("transportDate debe ser YYYY-MM-DD válido");
  if (input.articulatedVehicle && !cleanText(input.trailerRegistration ?? "")) {
    errors.push("trailerRegistration es obligatorio para vehículo articulado");
  }
  if (
    input.specialCirculationAuthorizationRequired &&
    !cleanText(input.specialCirculationAuthorization ?? "")
  ) {
    errors.push("specialCirculationAuthorization es obligatoria cuando el transporte la requiere");
  }
  if (!isValidHttpUrl(input.publicUrl)) errors.push("publicUrl debe ser HTTPS");

  const createdAt = asTimestamp(input.createdAt);
  const modifiedAt = asTimestamp(input.modifiedAt);
  if (createdAt == null) errors.push("createdAt no es una fecha válida");
  if (modifiedAt == null) errors.push("modifiedAt no es una fecha válida");
  if (createdAt != null && modifiedAt != null && modifiedAt < createdAt) {
    errors.push("modifiedAt no puede ser anterior a createdAt");
  }

  const printable = [
    ...requiredText.map(([, value]) => value),
    input.packaging ?? "",
    input.trailerRegistration ?? "",
    input.specialCirculationAuthorization ?? "",
    input.observations ?? "",
    input.publicUrl,
    ...(input.goodsLines ?? []).flatMap((line) => [line.description, line.packaging ?? ""]),
  ];
  for (const value of printable) {
    try {
      encodeWinAnsi(cleanText(value));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Texto no representable en PDF");
      break;
    }
  }

  return errors;
}

function wrapText(value: string, maxCharacters: number) {
  const text = cleanText(value);
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let index = 0; index < word.length; index += maxCharacters) {
        lines.push(word.slice(index, index + maxCharacters));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharacters && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function pdfDate(value: string) {
  const date = new Date(value);
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const min = date.getUTCMinutes().toString().padStart(2, "0");
  const ss = date.getUTCSeconds().toString().padStart(2, "0");
  return `D:${yyyy}${mm}${dd}${hh}${min}${ss}Z`;
}

function formatDateOnly(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatNumber(value: number, decimals = 2) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(value);
}

type PageCommands = string[];

function textCommand(x: number, y: number, size: number, value: string, bold = false) {
  return `BT /F${bold ? "2" : "1"} ${size.toFixed(2)} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfHex(value)} Tj ET`;
}

function addQr(commands: PageCommands, publicUrl: string, x: number, y: number, size: number) {
  const qr = QRCode.create(publicUrl, { errorCorrectionLevel: "M" });
  const quietZone = 4;
  const symbolSize = qr.modules.size + quietZone * 2;
  const moduleSize = size / symbolSize;
  commands.push("0 0 0 rg");
  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      const rx = x + (column + quietZone) * moduleSize;
      const ry = y + (qr.modules.size - row - 1 + quietZone) * moduleSize;
      commands.push(`${rx.toFixed(2)} ${ry.toFixed(2)} ${moduleSize.toFixed(2)} ${moduleSize.toFixed(2)} re f`);
    }
  }
  commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${size.toFixed(2)} ${size.toFixed(2)} re S`);
}

function buildPdf(objects: Buffer[], infoObjectId: number) {
  const header = Buffer.from("%PDF-1.7\n%âãÏÓ\n", "latin1");
  const chunks: Buffer[] = [header];
  const offsets: number[] = [0];
  let offset = header.byteLength;

  objects.forEach((body, index) => {
    const objectId = index + 1;
    offsets[objectId] = offset;
    const object = Buffer.concat([
      Buffer.from(`${objectId} 0 obj\n`, "ascii"),
      body,
      Buffer.from("\nendobj\n", "ascii"),
    ]);
    chunks.push(object);
    offset += object.byteLength;
  });

  const xrefOffset = offset;
  const xrefLines = [`xref`, `0 ${objects.length + 1}`, "0000000000 65535 f "];
  for (let objectId = 1; objectId <= objects.length; objectId += 1) {
    xrefLines.push(`${offsets[objectId].toString().padStart(10, "0")} 00000 n `);
  }
  const trailer = [
    ...xrefLines,
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoObjectId} 0 R >>`,
    "startxref",
    xrefOffset.toString(),
    "%%EOF",
    "",
  ].join("\n");
  chunks.push(Buffer.from(trailer, "ascii"));
  return new Uint8Array(Buffer.concat(chunks));
}

export function generateDeCANativePdf(input: DeCANativePdfInput) {
  const errors = validateDeCANativePdfInput(input);
  if (errors.length) throw new Error(`DeCA incompleto: ${errors.join("; ")}`);

  const pages: PageCommands[] = [[]];
  let pageIndex = 0;
  let y = A4_HEIGHT - PAGE_MARGIN;
  const current = () => pages[pageIndex];

  const newPage = () => {
    pages.push([]);
    pageIndex += 1;
    y = A4_HEIGHT - PAGE_MARGIN;
    current().push(textCommand(PAGE_MARGIN, y, 11, `DeCA ${cleanText(input.documentNumber)} — continuación`, true));
    y -= 25;
  };

  const ensureSpace = (height: number) => {
    if (y - height < FOOTER_Y + 24) newPage();
  };

  const addWrapped = (value: string, x: number, maxCharacters: number, size = 9, bold = false) => {
    const lines = wrapText(value, maxCharacters);
    for (const line of lines) {
      ensureSpace(size + 5);
      current().push(textCommand(x, y, size, line, bold));
      y -= size + 4;
    }
  };

  const addField = (label: string, value: string, maxCharacters = 88) => {
    ensureSpace(28);
    current().push(textCommand(PAGE_MARGIN, y, 8.4, label, true));
    y -= 11;
    addWrapped(value || "—", PAGE_MARGIN, maxCharacters, 9.2);
    y -= 4;
  };

  const addSection = (title: string) => {
    ensureSpace(34);
    y -= 3;
    current().push(`${PAGE_MARGIN.toFixed(2)} ${(y + 10).toFixed(2)} ${(A4_WIDTH - PAGE_MARGIN * 2).toFixed(2)} 0.6 re f`);
    current().push(textCommand(PAGE_MARGIN, y - 4, 10.2, title, true));
    y -= 24;
  };

  current().push(textCommand(PAGE_MARGIN, y, 17, "Documento de Control Administrativo (DeCA)", true));
  y -= 23;
  current().push(textCommand(PAGE_MARGIN, y, 9.5, "Transporte público de mercancías por carretera · España"));
  y -= 19;
  current().push(textCommand(PAGE_MARGIN, y, 11, `Documento: ${cleanText(input.documentNumber)}`, true));

  addQr(current(), input.publicUrl, A4_WIDTH - PAGE_MARGIN - 106, A4_HEIGHT - PAGE_MARGIN - 124, 106);
  current().push(textCommand(A4_WIDTH - PAGE_MARGIN - 106, A4_HEIGHT - PAGE_MARGIN - 139, 7.5, "QR de acceso directo al PDF", true));
  y = A4_HEIGHT - PAGE_MARGIN - 154;

  addSection("1. Identificación del servicio");
  addField("Fecha del transporte", formatDateOnly(input.transportDate));

  addSection("2. Partes obligatorias");
  addField("Cargador contractual — razón social", cleanText(input.contractualShipper.legalName));
  addField("Cargador contractual — NIF", cleanText(input.contractualShipper.taxId));
  addField("Cargador contractual — domicilio", cleanText(input.contractualShipper.domicile));
  addField("Transportista efectivo — razón social", cleanText(input.effectiveCarrier.legalName));
  addField("Transportista efectivo — NIF", cleanText(input.effectiveCarrier.taxId));

  addSection("3. Origen y destino");
  addField("Origen", cleanText(input.origin));
  addField("Destino", cleanText(input.destination));

  addSection("4. Mercancía");
  addField("Naturaleza", cleanText(input.goodsDescription));
  addField("Peso bruto", `${formatNumber(input.grossWeightKg, 2)} kg`);
  if (input.packages != null) addField("Bultos", input.packages.toString());
  if (cleanText(input.packaging ?? "")) addField("Embalaje", cleanText(input.packaging ?? ""));

  if (input.goodsLines?.length) {
    ensureSpace(30);
    current().push(textCommand(PAGE_MARGIN, y, 8.4, "Detalle de mercancía", true));
    y -= 14;
    for (const line of input.goodsLines) {
      const parts = [
        `${line.sequence}. ${cleanText(line.description)}`,
        line.packages != null ? `${line.packages} bultos` : "",
        cleanText(line.packaging ?? ""),
        line.grossWeightKg != null ? `${formatNumber(line.grossWeightKg, 2)} kg` : "",
      ].filter(Boolean);
      addWrapped(parts.join(" · "), PAGE_MARGIN + 8, 92, 8.5);
      y -= 3;
    }
  }

  addSection("5. Vehículo");
  addField("Matrícula del vehículo tractor", cleanText(input.tractorRegistration));
  if (input.articulatedVehicle) {
    addField("Matrícula del remolque o semirremolque", cleanText(input.trailerRegistration ?? ""));
  }

  addSection("6. Autorización especial de circulación");
  addField(
    "Identificador",
    cleanText(input.specialCirculationAuthorization ?? "") ||
      (input.specialCirculationAuthorizationRequired ? "Pendiente" : "No aplica"),
  );

  addSection("7. Observaciones y reservas");
  addField("Observaciones solicitadas por el cargador", cleanText(input.observations ?? "") || "Sin observaciones");

  addSection("8. Acceso digital y trazabilidad");
  addField("URL única HTTPS", input.publicUrl, 84);

  pages.forEach((commands, index) => {
    commands.push(textCommand(PAGE_MARGIN, FOOTER_Y + 14, 7.2, `Creado: ${new Date(input.createdAt).toISOString()} · Modificado: ${new Date(input.modifiedAt).toISOString()}`));
    commands.push(textCommand(A4_WIDTH - PAGE_MARGIN - 72, FOOTER_Y + 14, 7.2, `Página ${index + 1}/${pages.length}`));
    commands.push(`${PAGE_MARGIN.toFixed(2)} ${(FOOTER_Y + 26).toFixed(2)} ${(A4_WIDTH - PAGE_MARGIN * 2).toFixed(2)} 0.4 re f`);
  });

  const pageObjectIds = pages.map((_, index) => 5 + index * 2);
  const contentObjectIds = pages.map((_, index) => 6 + index * 2);
  const infoObjectId = 5 + pages.length * 2;
  const objects: Buffer[] = [];

  objects.push(Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "ascii"));
  objects.push(Buffer.from(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`, "ascii"));
  objects.push(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "ascii"));
  objects.push(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>", "ascii"));

  pages.forEach((commands, index) => {
    const content = Buffer.from(commands.join("\n"), "ascii");
    objects.push(Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH.toFixed(2)} ${A4_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`,
      "ascii",
    ));
    objects.push(Buffer.concat([
      Buffer.from(`<< /Length ${content.byteLength} >>\nstream\n`, "ascii"),
      content,
      Buffer.from("\nendstream", "ascii"),
    ]));
  });

  const info = [
    "<<",
    `/Title ${pdfHex(`DeCA ${cleanText(input.documentNumber)}`)}`,
    `/Author ${pdfHex("FORNEXA")}`,
    `/Creator ${pdfHex("FORNEXA DeCA native renderer")}`,
    `/Producer ${pdfHex("FORNEXA")}`,
    `/CreationDate ${pdfHex(pdfDate(input.createdAt))}`,
    `/ModDate ${pdfHex(pdfDate(input.modifiedAt))}`,
    ">>",
  ].join(" ");
  objects.push(Buffer.from(info, "ascii"));

  return buildPdf(objects, infoObjectId);
}
