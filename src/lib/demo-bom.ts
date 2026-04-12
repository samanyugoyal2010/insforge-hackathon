import { createBomLine, type BomDocument, type BomLine } from "@/lib/bom";
import type { MockProject } from "@/lib/mock-workspace";

type BomRow = Omit<BomLine, "id">;

/** When true, the assistant will generate/replace BOM lines for this reply. */
export function shouldAiGenerateBom(
  userMsg: string,
  bomLineCountAtSend: number,
): boolean {
  if (bomLineCountAtSend === 0) return true;
  const t = userMsg.toLowerCase();
  return /\b(bom|bill\s*of\s*materials?|parts?\s*list|components?\s*list|parts?|mpn|inventory|rebuild\s+bom|regenerate\s+bom|refresh\s+bom|update\s+bom|draft\s+bom)\b/.test(
    t,
  );
}

function linesFromPresets(rows: BomRow[]): BomLine[] {
  return rows.map((r) => createBomLine(r));
}

/** Domain-specific draft BOMs for seeded demo projects. */
const BY_PROJECT_ID: Record<string, BomDocument> = {
  p_pd: {
    lines: linesFromPresets([
      {
        designators: "J1",
        description: "USB Type-C receptacle, 24-pin, mid-mount",
        mpn: "1054500101",
        manufacturer: "Molex",
        qty: 1,
        footprint: "USB-C-16Pin",
        notes: "Sink PD path",
      },
      {
        designators: "U1",
        description: "USB PD controller, sink",
        mpn: "CYPD3177-24LQXQ",
        manufacturer: "Infineon",
        qty: 1,
        footprint: "QFN-24",
        notes: "CC negotiation",
      },
      {
        designators: "L1–L4",
        description: "Power inductor, 2.2 µH, low DCR",
        mpn: "744373491022",
        manufacturer: "Würth",
        qty: 4,
        footprint: "6x6mm",
        notes: "Interleaved buck",
      },
      {
        designators: "Q1–Q8",
        description: "N-ch MOSFET, 30 V, low Qg",
        mpn: "BSC440N10NS5",
        manufacturer: "Infineon",
        qty: 8,
        footprint: "SuperSO8",
        notes: "Sync rect / HS",
      },
      {
        designators: "C_bulk",
        description: "Al polymer cap, 100 µF, 16 V",
        mpn: "16SVPF100M",
        manufacturer: "Panasonic",
        qty: 4,
        footprint: "D8",
        notes: "Output bulk",
      },
    ]),
  },
  p_ble: {
    lines: linesFromPresets([
      {
        designators: "U1",
        description: "BLE SoC, nRF52 series",
        mpn: "nRF52840-QIAA",
        manufacturer: "Nordic",
        qty: 1,
        footprint: "QFN-73",
        notes: "Mesh + UART",
      },
      {
        designators: "Y1",
        description: "32 MHz crystal",
        mpn: "ABM8-272-B2T",
        manufacturer: "Abracon",
        qty: 1,
        footprint: "3225",
        notes: "HF clock",
      },
      {
        designators: "ANT1",
        description: "2.4 GHz PCB antenna / matching",
        mpn: "2450AT18B100",
        manufacturer: "Johanson",
        qty: 1,
        footprint: "Custom",
        notes: "Tune with VNA",
      },
      {
        designators: "L2",
        description: "Ferrite bead, 600 Ω @ 100 MHz",
        mpn: "BLM21PG221SN1",
        manufacturer: "Murata",
        qty: 2,
        footprint: "0805",
        notes: "Power rails",
      },
    ]),
  },
  p_hr: {
    lines: linesFromPresets([
      {
        designators: "D1–D4",
        description: "Green LED, 530 nm",
        mpn: "LTG-1500",
        manufacturer: "Lite-On",
        qty: 4,
        footprint: "0603",
        notes: "PPG emitters",
      },
      {
        designators: "PD1",
        description: "Photodiode, PIN, visible",
        mpn: "SFH 2701",
        manufacturer: "ams OSRAM",
        qty: 1,
        footprint: "1206",
        notes: "Sense path",
      },
      {
        designators: "U2",
        description: "Transimpedance amplifier + PGA",
        mpn: "ADPD1080",
        manufacturer: "Analog Devices",
        qty: 1,
        footprint: "LGA-28",
        notes: "Front-end",
      },
    ]),
  },
  p_motor: {
    lines: linesFromPresets([
      {
        designators: "U3",
        description: "3-phase gate driver",
        mpn: "DRV8353RS",
        manufacturer: "TI",
        qty: 1,
        footprint: "VQFN-40",
        notes: "FOC",
      },
      {
        designators: "Q10–Q15",
        description: "N-ch MOSFET, 60 V",
        mpn: "IPT015N10N5",
        manufacturer: "Infineon",
        qty: 6,
        footprint: "TO-252",
        notes: "Inverter leg",
      },
      {
        designators: "R_sense",
        description: "Shunt resistor, 1 mΩ, 1%",
        mpn: "WSL36371L000FEA",
        manufacturer: "Vishay",
        qty: 3,
        footprint: "2512",
        notes: "Phase current",
      },
    ]),
  },
  p_lidar: {
    lines: linesFromPresets([
      {
        designators: "U4",
        description: "ToF ASIC / SPAD driver",
        mpn: "VL53L5CX",
        manufacturer: "STMicro",
        qty: 1,
        footprint: "LGA-16",
        notes: "Ranging",
      },
      {
        designators: "VCSEL1",
        description: "850 nm VCSEL array",
        mpn: "—",
        manufacturer: "Custom",
        qty: 1,
        footprint: "COB",
        notes: "Timing critical",
      },
    ]),
  },
  p_solar: {
    lines: linesFromPresets([
      {
        designators: "U5",
        description: "MPPT buck controller",
        mpn: "BQ24650",
        manufacturer: "TI",
        qty: 1,
        footprint: "VQFN-24",
        notes: "Panel input",
      },
      {
        designators: "FET_MPPT",
        description: "P-ch MOSFET, 40 V",
        mpn: "SI7467DP",
        manufacturer: "Vishay",
        qty: 1,
        footprint: "SO-8",
        notes: "High-side switch",
      },
    ]),
  },
};

function genericFallback(project: MockProject, userMsg: string): BomDocument {
  const blob = `${project.name} ${project.tagline} ${userMsg}`.toLowerCase();
  const rows: BomRow[] = [
    {
      designators: "U1",
      description: "Main MCU / SoC",
      mpn: "—",
      manufacturer: "TBD",
      qty: 1,
      footprint: "QFN",
      notes: "Pick from block diagram",
    },
    {
      designators: "P1",
      description: "Connector, power input",
      mpn: "—",
      manufacturer: "TBD",
      qty: 1,
      footprint: "TBD",
      notes: "Voltage rail",
    },
    {
      designators: "C_bulk",
      description: "Bulk cap, 10–100 µF",
      mpn: "—",
      manufacturer: "TBD",
      qty: 2,
      footprint: "0805/1206",
      notes: "Decoupling",
    },
  ];
  if (/usb|pd|type-c|type c/.test(blob)) {
    rows.unshift({
      designators: "J_USB",
      description: "USB-C receptacle",
      mpn: "1054500101",
      manufacturer: "Molex",
      qty: 1,
      footprint: "USB-C",
      notes: "Inferred from intent",
    });
  }
  if (/ble|bluetooth|mesh|rf|wireless/.test(blob)) {
    rows.unshift({
      designators: "U_rf",
      description: "BLE module / SoC",
      mpn: "nRF52840",
      manufacturer: "Nordic",
      qty: 1,
      footprint: "QFN",
      notes: "Inferred from intent",
    });
  }
  return { lines: linesFromPresets(rows) };
}

function cloneDoc(doc: BomDocument): BomDocument {
  return {
    lines: doc.lines.map((l) =>
      createBomLine({
        designators: l.designators,
        description: l.description,
        mpn: l.mpn,
        manufacturer: l.manufacturer,
        qty: l.qty,
        footprint: l.footprint,
        notes: l.notes,
      }),
    ),
  };
}

export function generateDemoBomDocument(
  project: MockProject,
  userMsg: string,
): BomDocument {
  const preset = BY_PROJECT_ID[project.id];
  if (!preset) return genericFallback(project, userMsg);

  const intent = userMsg.toLowerCase();
  const base = cloneDoc(preset);

  // Simple "without/no ..." removals so the demo feels agentic.
  const noUsb = /\b(no\s*usb|without\s*usb|without\s*type[-\s]?c|no\s*type[-\s]?c|no\s*pd|without\s*pd|without\s*power\s*delivery)\b/.test(
    intent,
  );
  const noBle = /\b(no\s*ble|without\s*ble|without\s*bluetooth|no\s*bluetooth|without\s*mesh|no\s*mesh|without\s*rf|no\s*rf)\b/.test(
    intent,
  );
  const noBattery = /\b(no\s*battery|without\s*battery|no\s*coin\s*cell|without\s*coin\s*cell|no\s*aa|without\s*aa)\b/.test(
    intent,
  );

  let lines = base.lines;
  if (noUsb) {
    lines = lines.filter((l) => {
      const hay = `${l.designators} ${l.description} ${l.mpn} ${l.manufacturer} ${l.notes}`.toLowerCase();
      return !/(usb|type[-\s]?c|pd|power\s*delivery)/.test(hay);
    });
  }
  if (noBle) {
    lines = lines.filter((l) => {
      const hay = `${l.designators} ${l.description} ${l.mpn} ${l.manufacturer} ${l.notes}`.toLowerCase();
      return !/(ble|bluetooth|mesh|rf|wireless)/.test(hay);
    });
  }
  if (noBattery) {
    lines = lines.filter((l) => {
      const hay = `${l.designators} ${l.description} ${l.mpn} ${l.manufacturer} ${l.notes}`.toLowerCase();
      return !/(battery|coin\s*cell|aa|watch\s*battery)/.test(hay);
    });
  }

  // Add inferred extras (only a small safe subset) without overriding core preset parts.
  const inferred = genericFallback(project, userMsg).lines;
  const extras = inferred.filter((l) => l.designators === "J_USB" || l.designators === "U_rf");

  const byDesignator = new Map<string, BomLine>();
  for (const l of lines) byDesignator.set(l.designators, l);
  for (const l of extras) byDesignator.set(l.designators, l);

  return { lines: Array.from(byDesignator.values()) };
}
