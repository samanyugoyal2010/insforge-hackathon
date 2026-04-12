/**
 * Shared board prompt templates for Home featured cards and the Templates tab.
 * Ideas are intentionally simple, everyday products—closer to how people actually ask.
 */

import type { TemplateAccent } from "@/lib/template-visuals";

export type BoardTemplate = {
  id: string;
  category: string;
  accent: TemplateAccent;
  title: string;
  tagline: string;
  description: string;
  bullets: string[];
  /** User-voice prompt; we’ll grow into PCB, BOM, ordering, and AR help later. */
  prompt: string;
};

/** Featured on Home — iconic, easy to grasp. */
export const HOME_TEMPLATE_IDS = [
  "dog-feeder",
  "plant-monitor",
  "night-light",
] as const;

export const BOARD_TEMPLATE_CATEGORIES = [
  "All",
  "Pets & home",
  "Plants & garden",
  "Lights & rooms",
  "Kids & play",
  "Desk & work",
  "Portable",
] as const;

export type BoardTemplateCategory = (typeof BOARD_TEMPLATE_CATEGORIES)[number];

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: "dog-feeder",
    category: "Pets & home",
    accent: "amber",
    title: "Automatic dog feeder",
    tagline: "Dispense kibble on a schedule you set",
    description:
      "A small gadget that drops dry food at meal times so you’re not tied to the clock—think auger or trapdoor, not industrial automation.",
    bullets: [
      "Motor or servo to release a measured portion",
      "RTC or phone schedule so times are easy to change",
      "Food-safe path: easy to clean, hard for paws to jam",
    ],
    prompt:
      "Build me a simple automatic dog feeder that dispenses dry kibble on a schedule I can change from my phone. USB or battery is fine—prioritize a straightforward mechanical design and a clear BOM I could hand-solder. ",
  },
  {
    id: "plant-monitor",
    category: "Plants & garden",
    accent: "emerald",
    title: "Houseplant soil watcher",
    tagline: "Know when your plant is thirsty",
    description:
      "Stick a probe in the dirt and get a clear signal before the leaves droop—LED, buzzer, or phone ping.",
    bullets: [
      "Soil moisture sense without killing roots (corrosion-aware)",
      "Calibration idea: “too dry” vs “fine”",
      "Low power if it lives on a battery by the pot",
    ],
    prompt:
      "I want a tiny board that tells me when my houseplant’s soil is too dry—LED or gentle buzzer is enough, bonus if it can notify my phone later. Keep it beginner-friendly and cheap. ",
  },
  {
    id: "night-light",
    category: "Lights & rooms",
    accent: "violet",
    title: "Hallway night light",
    tagline: "Soft light when it’s dark, off after a while",
    description:
      "Walk past at night without flipping switches—warm light that fades out so it doesn’t run all night.",
    bullets: [
      "Ambient light sensor so it only runs in the dark",
      "Warm white LED, dim enough for sleep",
      "Auto-off timer so it doesn’t stay on forever",
    ],
    prompt:
      "Design a simple hallway night light: turns on when the room is dark, warm white, and turns off automatically after maybe 30–60 minutes. Wall plug or USB brick is fine. ",
  },
  {
    id: "cat-fountain",
    category: "Pets & home",
    accent: "sky",
    title: "Cat water fountain timer",
    tagline: "Run a small pump on a gentle schedule",
    description:
      "Keep water moving so cats drink more—short pump runs a few times an hour instead of 24/7 noise.",
    bullets: [
      "Low-voltage pump control with safe current limit",
      "Easy to clean; 5 V USB friendly",
      "Optional flow fault if pump runs dry",
    ],
    prompt:
      "Small pump controller for a cat water fountain: run the pump a few minutes every hour instead of always on, USB powered, simple and quiet. ",
  },
  {
    id: "window-sensor",
    category: "Desk & work",
    accent: "slate",
    title: "Window open chime",
    tagline: "Know if a window opened while you’re out",
    description:
      "Magnet on the sash, reed on the frame—beep or phone alert when it opens unexpectedly.",
    bullets: [
      "Magnetic reed or hall switch, debounced input",
      "Battery-friendly sleep with wake on change",
      "Arm/disarm so you don’t get alerts when you’re home",
    ],
    prompt:
      "I’d like a small device that alerts me if my apartment window opens when I’m away—magnet sensor, local beep or later BLE to phone. Keep the circuit minimal. ",
  },
  {
    id: "timer-cube",
    category: "Kids & play",
    accent: "rose",
    title: "Kitchen timer cube",
    tagline: "Twist or tap to set minutes, buzz when done",
    description:
      "Physical timer with LEDs showing countdown—more fun than a phone for kids and flour hands.",
    bullets: [
      "Rotary encoder or a few presets (5 / 10 / 15 min)",
      "Piezo buzzer at zero",
      "Big enough UI that kids can use it",
    ],
    prompt:
      "Fun kitchen timer cube with LEDs and a buzzer—set time with a knob or buttons, countdown visible, loud enough to hear from the next room. ",
  },
  {
    id: "key-finder",
    category: "Portable",
    accent: "cyan",
    title: "Key finder tag",
    tagline: "Make your keys beep from your phone",
    description:
      "House-scale BLE tag: tap “find” in an app and the tag chirps so you can dig it out of the couch.",
    bullets: [
      "BLE beacon + buzzer, coin cell months of idle",
      "Small PCB that fits a keychain case",
      "Pairing flow kept as simple as possible",
    ],
    prompt:
      "Build a simple BLE key finder: I tap find on my phone and the tag on my keys beeps. Range is just my apartment, nothing fancy. ",
  },
  {
    id: "desk-clock",
    category: "Desk & work",
    accent: "zinc",
    title: "Minimal desk clock",
    tagline: "Time and indoor temp, no cloud account",
    description:
      "Small display on your desk—temperature optional, no mandatory app or Wi-Fi login.",
    bullets: [
      "OLED or e-paper, RTC with backup battery",
      "Temp/humidity sensor optional",
      "USB powered from a monitor brick",
    ],
    prompt:
      "Minimal desk clock with small display and optional temperature—powered by USB, no cloud required, straightforward BOM. ",
  },
  {
    id: "seed-mat",
    category: "Plants & garden",
    accent: "emerald",
    title: "Seedling heat mat",
    tagline: "Keep seed trays gently warm",
    description:
      "Simple thermostat for a heating mat—hold soil near room-temperature-plus for germination.",
    bullets: [
      "NTC or thermistor against target setpoint",
      "SSR or MOSFET for mat power (low voltage mat)",
      "LED shows heating vs idle",
    ],
    prompt:
      "Controller for a seedling heat mat: keep soil around a set temperature for starting seeds, simple dial or buttons, safe for a desk setup. ",
  },
  {
    id: "mood-lamp",
    category: "Lights & rooms",
    accent: "violet",
    title: "Desk mood lamp",
    tagline: "A few presets—warm read, cool focus, off",
    description:
      "RGB strip behind the monitor or on the shelf—pick a vibe without opening ten apps.",
    bullets: [
      "WS2812-style strip or RGB + warm white",
      "Three–four scenes, one button to cycle",
      "Flicker-free PWM",
    ],
    prompt:
      "RGB accent lamp for my desk with a few preset scenes—warm for reading, cooler for focus, and off. One device, simple controls. ",
  },
  {
    id: "macro-pad",
    category: "Desk & work",
    accent: "sky",
    title: "Big shortcut buttons",
    tagline: "Mute, camera, next slide—physical keys",
    description:
      "Macro pad for calls and slides: chunky keys your kid won’t miss, HID over USB.",
    bullets: [
      "Mechanical or big tactile switches",
      "USB HID keyboard shortcuts",
      "Labels or RGB per key optional",
    ],
    prompt:
      "Macro keypad with big buttons for mute, camera on/off, and next slide during video calls—USB, works like a keyboard, easy to label. ",
  },
  {
    id: "coaster-warmer",
    category: "Desk & work",
    accent: "amber",
    title: "Coffee mug warmer",
    tagline: "Gentle heat so coffee stays drinkable",
    description:
      "Low-watt heater under a ceramic coaster—thermostat so it doesn’t run away.",
    bullets: [
      "NTC on the plate, PID or bang-bang with hysteresis",
      "Limit max temperature for safety",
      "12 V or USB-PD extension if needed—keep it modest",
    ],
    prompt:
      "Simple powered coaster to keep my coffee mug warm—not boiling, just slow the cooldown—with a temperature limit for safety. ",
  },
  {
    id: "mail-flag",
    category: "Portable",
    accent: "slate",
    title: "Mailbox flap notifier",
    tagline: "Ping when the mail arrives",
    description:
      "Switch or tilt sensor on the door—know when the letter carrier came.",
    bullets: [
      "Mechanical switch or accelerometer tilt",
      "Low-power radio or BLE notification",
      "Weather-resistant thoughts for the enclosure",
    ],
    prompt:
      "Sensor for a mailbox door that notifies me when mail is delivered—simple switch or tilt, battery powered if possible. ",
  },
  {
    id: "bathroom-fan",
    category: "Lights & rooms",
    accent: "cyan",
    title: "Bathroom fan timer",
    tagline: "Run the vent after a shower, then stop",
    description:
      "Tie to the light or a button—fan clears steam for ten minutes without you remembering.",
    bullets: [
      "Relay or triac for existing vent fan line voltage—careful isolation",
      "Or low-voltage trigger if fan is separate module",
      "Adjustable run time",
    ],
    prompt:
      "Timer for a bathroom exhaust fan: when the light goes on, after I leave, run the fan for 10 minutes then stop—simple wall-mounted control. ",
  },
];

export function getHomeFeaturedTemplates(): BoardTemplate[] {
  return HOME_TEMPLATE_IDS.map((id) => {
    const t = BOARD_TEMPLATES.find((x) => x.id === id);
    if (!t) throw new Error(`Missing template: ${id}`);
    return t;
  });
}

export type { TemplateAccent } from "@/lib/template-visuals";
