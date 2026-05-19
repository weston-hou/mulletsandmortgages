/**
 * lib/scripts.ts
 * Conversation script configurations for the SMS AI agent.
 * Swap script_id in experiment variants for A/B testing.
 *
 * Supports template variables: {{first_name}}, {{loan_purpose}}, {{zip}}
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrequalPrompt {
  field: string;
  prompt: string;
  follow_up?: string;
}

export interface ScriptConfig {
  id: string;
  name: string;
  /** First message template. Supports {{first_name}}, {{loan_purpose}}, {{zip}} */
  intro: string;
  /** Pre-qual fields to collect, in order */
  prequal_prompts: PrequalPrompt[];
  /** Message sent when offering a voice call to the lead */
  escalate_to_call: string;
  /** Message sent when handing off to Zach personally */
  handoff_to_zach: string;
  /** Stage-specific check-in messages (arrays = rotate/pick randomly) */
  stage_messages: Record<string, string[]>;
  /** Response when lead texts STOP (Twilio handles actual blocking) */
  stop_ack: string;
}

export interface PrequalFields {
  full_name: string;
  prequal_zip: string;
  prequal_employment: string;
  prequal_income: string;
  prequal_liabilities: string;
  prequal_credit_score: string;
}

// ─── Scripts ─────────────────────────────────────────────────────────────────

/**
 * intro_v1 — Warm, emoji-light, question-based opener
 * Lead: feels heard, low pressure, curious
 */
export const intro_v1: ScriptConfig = {
  id: "intro_v1",
  name: "Warm Question Opener",
  intro:
    "Hey {{first_name}}! 👋 This is Zach's assistant from Mullets & Mortgages. " +
    "Saw you were looking into {{loan_purpose}} — awesome! Quick question: " +
    "are you looking at properties in the {{zip}} area, or is that more of a starting point? " +
    "Reply STOP anytime to opt out.",

  prequal_prompts: [
    {
      field: "full_name",
      prompt:
        "Before we dig in — what's your full legal name? Just want to make sure I have it right.",
      follow_up: "Got it! And to confirm the spelling — is that {{value}}?",
    },
    {
      field: "prequal_zip",
      prompt:
        "What zip code are you targeting for the property? Even a rough area works.",
      follow_up:
        "Perfect, {{value}} — lots of good inventory there lately. 🏠",
    },
    {
      field: "prequal_employment",
      prompt:
        "How long have you been at your current job? And is it W-2, self-employed, or something else?",
      follow_up:
        "That helps a lot — lenders love consistency. Any gaps in the last 2 years?",
    },
    {
      field: "prequal_income",
      prompt:
        "Roughly what's your annual income? You can ballpark it — doesn't need to be exact.",
      follow_up:
        "Awesome, I'll use that as our working number. Does that include any bonuses or side income?",
    },
    {
      field: "prequal_liabilities",
      prompt:
        "Last financial question, promise 😅 — do you have any monthly debt payments? Like a car loan, credit cards, student loans, etc.? Just the rough monthly total.",
      follow_up:
        "Got it. Even approximate numbers help us figure out what you qualify for.",
    },
    {
      field: "prequal_credit_score",
      prompt:
        "And what's your credit score in the ballpark? You can check free on Credit Karma if you're not sure. No hard pull needed on our end.",
      follow_up:
        "{{value}} — solid. That opens up a lot of good programs.",
    },
  ],

  escalate_to_call:
    "I think a quick 10-minute call with Zach would really help clarify your options. " +
    "He can walk through exact numbers with you. Would you be open to a call? If so, just say *yes* and I'll get you on his calendar! 📅",

  handoff_to_zach:
    "Great news — I'm looping in Zach directly for this one. He'll reach out to you personally " +
    "within the next couple hours. He's the best in the biz at finding the right program for your situation. 💪",

  stage_messages: {
    shopping: [
      "Hey {{first_name}}, just checking in — any homes catching your eye yet? 🏠",
      "How's the house hunt going? Let me know if you want Zach to run quick numbers on anything you've seen.",
    ],
    under_contract: [
      "Congrats on getting under contract, {{first_name}}! 🎉 Let's get your file moving — anything you need from us right now?",
      "You're under contract — exciting! Zach's team is ready to roll. Any questions on next steps?",
    ],
    underwriting: [
      "Hey {{first_name}}, you're in underwriting — the finish line is in sight! 🏁 Any questions while you wait?",
      "Underwriting is moving on your file. Hang tight — Zach will flag anything that needs your attention ASAP.",
    ],
    closing: [
      "Almost there, {{first_name}}! Closing day is coming up. 🔑 Anything you need from us before then?",
      "You're so close! Final stretch — let Zach know if you have any last-minute questions before closing.",
    ],
  },

  stop_ack:
    "Got it — you've been removed from our message list. Best of luck with your home purchase! 🏠",
};

/**
 * intro_v2 — Direct, benefit-forward opener
 * Lead: sees value immediately, faster to the point
 */
export const intro_v2: ScriptConfig = {
  id: "intro_v2",
  name: "Direct Benefit Opener",
  intro:
    "Hi {{first_name}} — Zach Boyko's assistant here at Mullets & Mortgages. " +
    "You checked out rates for {{loan_purpose}} — great timing. We work with 150+ lenders " +
    "and typically save buyers $200–$400/mo vs going to a single bank. " +
    "Takes about 5 min to see what you qualify for. Good to connect? " +
    "Reply STOP to opt out.",

  prequal_prompts: [
    {
      field: "full_name",
      prompt: "What's your full legal name so I can pull up your inquiry?",
      follow_up: "Perfect, thanks {{value}}.",
    },
    {
      field: "prequal_zip",
      prompt:
        "What zip code are you looking in? Helps us check which programs are available there.",
      follow_up: "Got it — {{value}}. Good market.",
    },
    {
      field: "prequal_employment",
      prompt:
        "Are you W-2 employed, self-employed, or retired? And how long at your current position?",
      follow_up: "Noted. Lenders want to see 2 years of consistency.",
    },
    {
      field: "prequal_income",
      prompt: "What's your approximate annual income?",
      follow_up: "Using {{value}} as our baseline — works.",
    },
    {
      field: "prequal_liabilities",
      prompt:
        "Any monthly debt payments — car, student loans, credit cards? Rough total is fine.",
      follow_up:
        "That affects your debt-to-income ratio. Good to know upfront.",
    },
    {
      field: "prequal_credit_score",
      prompt: "Credit score range? Ballpark is fine — no hard pull needed.",
      follow_up: "{{value}} — you're in good shape.",
    },
  ],

  escalate_to_call:
    "Honestly, the fastest way to get you exact numbers is a quick call with Zach — 10 min max. " +
    "He's helped hundreds of buyers in your situation find programs they didn't know existed. " +
    "Want me to get you on his calendar? Just say *yes*.",

  handoff_to_zach:
    "I'm flagging this for Zach directly — he's the best person to answer your question. " +
    "He'll reach out personally within the next few hours. Talk soon!",

  stage_messages: {
    shopping: [
      "Hey {{first_name}} — any homes on the radar yet? Let me know if you want quick numbers on anything. 🏠",
      "How's the search? Market moves fast — we're here when you're ready to lock something in.",
    ],
    under_contract: [
      "Congrats on going under contract, {{first_name}}! 🎉 Let's get your file in front of lenders. What do you need?",
      "You got one under contract — now let's get you the best rate. Zach's on it. Questions?",
    ],
    underwriting: [
      "You're in underwriting, {{first_name}} — almost at the finish line. Any questions while you wait? 🏁",
      "Underwriting is in progress. Zach will flag anything needed on your end right away.",
    ],
    closing: [
      "Closing day is almost here, {{first_name}}! 🔑 Need anything from us before then?",
      "Final stretch! Let us know if anything comes up before closing.",
    ],
  },

  stop_ack:
    "You've been removed from our list. No more messages from us. Good luck with your search! 🏠",
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const SCRIPTS: Record<string, ScriptConfig> = {
  intro_v1,
  intro_v2,
};

export function getScript(id: string): ScriptConfig {
  const script = SCRIPTS[id];
  if (!script) throw new Error(`Unknown script id: ${id}`);
  return script;
}

/**
 * Fill template variables in a string.
 * Supports: {{first_name}}, {{loan_purpose}}, {{zip}}, {{value}}
 */
export function fillTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
