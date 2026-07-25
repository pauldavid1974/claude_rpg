// Dialogue system: per-character typing, name tag, choices, and the
// per-NPC scripts that drive the quest flow.

import { G, VW, VH } from './state.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import { drawPanel, drawText, drawHeading } from './ui.js';
import {
  isActive, isDone, canTurnIn, startQuest, turnIn, questProgress, QUESTS,
} from './quests.js';
import { addItem, hasItem, removeItem } from './inventory.js';
import { openShop } from './shops.js';

// A script: { name, pages: [str], choice?: {prompt, yes, no, onYes, onNo}, onDone }
let script = null, page = 0, chars = 0, choiceSel = 0, choosing = false;

export function say(name, pages, extra = {}) {
  script = { name, pages, ...extra };
  page = 0; chars = 0; choosing = false; choiceSel = 0;
  G.mode = 'dialogue';
}

function choiceRow(i) {
  // hit zones matching where drawDialogue puts the two choice lines
  const w = Math.min(272, VW - 12);
  const x = Math.round((VW - w) / 2), y = VH - 60;
  return input.mouse.x > x + w - 130 && input.mouse.x < x + w - 8 &&
         input.mouse.y > y + 18 + i * 12 && input.mouse.y < y + 30 + i * 12;
}

export function updateDialogue(dt) {
  const advance = input.pressed.interact || input.pressed.attack || input.mouse.clicked;
  const text = script.pages[page];
  if (chars < text.length) {
    chars = Math.min(text.length, chars + dt * 45);
    if (advance) chars = text.length; // skip typing
    return;
  }
  if (choosing) {
    if (input.pressed.up || input.pressed.down || input.pressed.left || input.pressed.right) {
      choiceSel = 1 - choiceSel; sfx('menu');
    }
    let confirm = input.pressed.interact;
    for (const i of [0, 1]) {
      if (choiceRow(i)) {
        if (choiceSel !== i) { choiceSel = i; sfx('menu'); }
        if (input.mouse.clicked) confirm = true;
      }
    }
    if (confirm) {
      const c = script.choice;
      const cb = choiceSel === 0 ? c.onYes : c.onNo;
      script = null;
      G.mode = 'play';
      if (cb) cb();
      return;
    }
    return;
  }
  if (advance) {
    if (page < script.pages.length - 1) {
      page++; chars = 0; sfx('menu');
    } else if (script.choice) {
      choosing = true; sfx('menu');
    } else {
      const done = script.onDone;
      script = null;
      G.mode = 'play';
      if (done) done();
    }
  }
}

export function drawDialogue(ctx) {
  if (!script) return;
  const w = Math.min(272, VW - 12), h = 52;
  const x = Math.round((VW - w) / 2), y = VH - h - 8;
  drawPanel(ctx, x, y, w, h);
  if (script.name) {
    ctx.font = '15px "Jacquard 12"';
    const nw = Math.max(44, Math.ceil(ctx.measureText(script.name).width) + 18);
    drawPanel(ctx, x + 6, y - 11, nw, 18);
    drawHeading(ctx, script.name, x + 15, y + 2);
  }
  const text = script.pages[page].slice(0, Math.floor(chars));
  ctx.font = '7px monospace';
  let yy = y + 14;
  for (const line of text.split('\n')) {
    let cur = '';
    for (const word of line.split(' ')) {
      const test = cur ? cur + ' ' + word : word;
      if (ctx.measureText(test).width > w - 24 && cur) {
        drawText(ctx, cur, x + 12, yy, '#ffffff'); yy += 10; cur = word;
      } else cur = test;
    }
    drawText(ctx, cur, x + 12, yy, '#ffffff'); yy += 10;
  }
  const full = chars >= script.pages[page].length;
  if (full && choosing) {
    const c = script.choice;
    const cxp = x + w - 126;
    drawText(ctx, (choiceSel === 0 ? '> ' : '  ') + c.yes, cxp, y + 26, choiceSel === 0 ? '#fee761' : '#c0cbdc');
    drawText(ctx, (choiceSel === 1 ? '> ' : '  ') + c.no, cxp, y + 38, choiceSel === 1 ? '#fee761' : '#c0cbdc');
  } else if (full && Math.floor(G.time * 2.5) % 2) {
    drawText(ctx, 'v', x + w - 14, y + h - 8, '#feae34');
  }
}

// --- NPC scripts -------------------------------------------------------

export function talkTo(npc) {
  if (npc.shop) {
    say(npc.name, [npc.shop === 'general'
      ? 'Welcome in! Take a look at my wares.'
      : 'Steel, leather, and no haggling. Have a look.'],
      { onDone: () => openShop(npc.shop) });
    return;
  }
  switch (npc.id) {
    case 'elder': return elder(npc);
    case 'sage': return sage(npc);
    case 'lila': return lila(npc);
    case 'pip': return pip(npc);
    case 'bram':
      return say(npc.name, G.flags.bossDead
        ? ['The Bone King, felled! Ha! My swords sung in worthy hands.']
        : ['Need steel? My cousin Edda runs the smithy behind me.',
           'Cheap blades crack. Good blades cost. That is the whole of smithing.']);
    case 'kid2':
      return say(npc.name, G.flags.bossDead
        ? ['You went INSIDE the crypt? And came back OUT?!']
        : ['Mira talks to her herbs. I heard her thank one once.']);
  }
}

function elder(npc) {
  // Main-quest spine, in order.
  if (!G.quests.q_slimes) {
    return say(npc.name, [
      'Ah, a traveler with a blade! Emberdale could use one.',
      'Slimes have overrun the western fields - my farmers cannot work. Would you thin them out? Five should do.',
    ], {
      choice: {
        prompt: 'Help the fields?', yes: 'I\'ll do it', no: 'Not now',
        onYes: () => startQuest('q_slimes'),
        onNo: () => say(npc.name, ['Mm. The fields will wait, but not forever.']),
      },
    });
  }
  if (isActive('q_slimes')) {
    if (canTurnIn('q_slimes')) {
      return say(npc.name, [
        'The fields are quiet again. You have my thanks, and my coin.',
        'Rest, then come back - I have a more delicate errand for you.',
      ], { onDone: () => turnIn('q_slimes') });
    }
    return say(npc.name, ['How goes the hunt? ' + questProgress('q_slimes') + ' of ' +
      QUESTS.q_slimes.need + ' slimes so far. The west fields, past the pond.']);
  }
  if (!G.quests.q_letter) {
    return say(npc.name, [
      'That errand. This letter must reach Sage Mira in Ashvale - follow the road east.',
      'Do not break the seal. Mira will know what to do.',
    ], { onDone: () => { addItem('letter', 1); startQuest('q_letter'); } });
  }
  if (isActive('q_letter')) {
    return say(npc.name, ['Mira\'s house is the blue-roofed one in Ashvale, east along the road.']);
  }
  if (isActive('q_boss')) {
    if (canTurnIn('q_boss') && hasItem('amulet')) {
      return say(npc.name, [
        'By the old fires... the Ember Amulet. You truly felled the Bone King.',
        'Emberdale owes you a debt no coin can square - but take this all the same, hero.',
      ], { onDone: () => { removeItem('amulet', 1); turnIn('q_boss'); G.flags.mainDone = true; } });
    }
    return say(npc.name, ['The crypt lies north. Strike true, and bring our amulet home.']);
  }
  if (G.flags.mainDone) {
    return say(npc.name, ['The hero of Emberdale! The fields are green and the crypt is silent. Stay as long as you like.']);
  }
  return say(npc.name, ['Mira will have work for you in Ashvale, I expect.']);
}

function sage(npc) {
  if (isActive('q_letter') && hasItem('letter')) {
    return say(npc.name, [
      'Rowan\'s seal... give it here.',
      '...So. The crypt stirs, and the Ember Amulet with it. As I feared.',
      'I can open a way, but I need things first. Moonherbs - three sprigs. They glow in the forest clearings east of the crossroads.',
    ], { onDone: () => { turnIn('q_letter'); startQuest('q_herbs'); } });
  }
  if (isActive('q_herbs')) {
    if (canTurnIn('q_herbs')) {
      return say(npc.name, [
        'Fresh moonherb - well picked.',
        'Now the grim part. The gate below answers only to bone. Bring me three old bones; the skeletons on the north road carry them.',
      ], { onDone: () => { turnIn('q_herbs'); startQuest('q_bones'); } });
    }
    return say(npc.name, ['Moonherbs: ' + questProgress('q_herbs') + ' of 3. Look for the silver shimmer in the eastern clearings.']);
  }
  if (isActive('q_bones')) {
    if (canTurnIn('q_bones')) {
      return say(npc.name, [
        'Three bones, still humming with old malice. Perfect.',
        '...There. A key of bone. It will open the barred gate inside the crypt.',
        'The Bone King holds the Ember Amulet. Slay him, and carry it to Rowan. And do not go in half-armed - see the smiths.',
      ], { onDone: () => { turnIn('q_bones'); startQuest('q_boss'); } });
    }
    return say(npc.name, ['Bones: ' + questProgress('q_bones') + ' of 3. The north road rattles with them.']);
  }
  if (isActive('q_boss')) {
    if (G.flags.bossDead) {
      return say(npc.name, ['It is done - I felt the crypt go quiet. Take the amulet to Rowan; the honor is his to give.']);
    }
    return say(npc.name, ['The bone key opens the inner gate. The King will be beyond it. Potions, steel, courage - in that order.']);
  }
  if (G.flags.mainDone) {
    return say(npc.name, ['The amulet is home and the dead sleep. You did well, traveler.']);
  }
  return say(npc.name, ['Hmm? I am busy with my herbs. If Rowan sends word, bring it quickly.']);
}

function lila(npc) {
  if (!G.quests.q_bats) {
    return say(npc.name, [
      'Those bats from the forest keep spooking my hens - eggs everywhere!',
      'Could you drive some off? Four fewer would let us all sleep.',
    ], {
      choice: {
        prompt: 'Help?', yes: 'Consider it done', no: 'Maybe later',
        onYes: () => startQuest('q_bats'),
        onNo: () => say(npc.name, ['Oh. Well... mind your head at dusk, then.']),
      },
    });
  }
  if (isActive('q_bats')) {
    if (canTurnIn('q_bats')) {
      return say(npc.name, ['The hens are finally laying again! You dear. Here - saved from the egg money.'],
        { onDone: () => turnIn('q_bats') });
    }
    return say(npc.name, ['Bats: ' + questProgress('q_bats') + ' of 4. They roost in the south-east woods.']);
  }
  return say(npc.name, ['Quiet skies and fat hens. Bless you for that.']);
}

function pip(npc) {
  if (!G.quests.q_gels) {
    return say(npc.name, [
      'Psst. Hey. You fight slimes, right?',
      'The wobbly bits they drop? Berta ate one and she said it tastes like BERRIES. I need two. For, um, research.',
    ], {
      choice: {
        prompt: 'Bring gel?', yes: 'Sure, kid', no: 'Gross',
        onYes: () => startQuest('q_gels'),
        onNo: () => say(npc.name, ['You are no fun at ALL.']),
      },
    });
  }
  if (isActive('q_gels')) {
    if (canTurnIn('q_gels')) {
      return say(npc.name, ['YES! Two whole gels! Here, my whole allowance. Worth it.'],
        { onDone: () => turnIn('q_gels') });
    }
    return say(npc.name, ['Got the gels yet? ' + questProgress('q_gels') + ' of 2. Slimes! West fields! Go go go!']);
  }
  return say(npc.name, ['...it did NOT taste like berries. Berta is a liar.']);
}
