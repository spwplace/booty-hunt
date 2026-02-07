#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function pctPointDelta(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}pp`;
}

function collectJsonFiles(inputs) {
  const files = [];
  const seen = new Set();
  const addFile = (filePath) => {
    const abs = path.resolve(filePath);
    if (seen.has(abs)) return;
    if (!fs.existsSync(abs)) return;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(abs)) {
        if (entry.toLowerCase().endsWith('.json')) {
          addFile(path.join(abs, entry));
        }
      }
      return;
    }
    if (abs.toLowerCase().endsWith('.json')) {
      seen.add(abs);
      files.push(abs);
    }
  };

  for (const input of inputs) addFile(input);
  return files;
}

function parseRunOutcome(events) {
  let latestTs = -Infinity;
  let result = null;
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const name = event.name;
    const ts = typeof event.ts === 'number' ? event.ts : -Infinity;
    if (name === 'run_victory' && ts >= latestTs) {
      latestTs = ts;
      result = true;
    }
    if (name === 'run_game_over' && ts >= latestTs) {
      latestTs = ts;
      result = false;
    }
  }
  return result;
}

function ensureChoiceStats(map, cardId, choiceId) {
  if (!map.has(cardId)) map.set(cardId, new Map());
  const byChoice = map.get(cardId);
  if (!byChoice.has(choiceId)) {
    byChoice.set(choiceId, {
      picks: 0,
      wins: 0,
      losses: 0,
      branches: { success: 0, failure: 0, neutral: 0, other: 0 },
    });
  }
  return byChoice.get(choiceId);
}

function main() {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    console.error('Usage: node scripts/analyze-telemetry.mjs <telemetry.json|dir> [...]');
    process.exit(1);
  }

  const files = collectJsonFiles(inputs);
  if (files.length === 0) {
    console.error('No telemetry JSON files found in inputs.');
    process.exit(1);
  }

  const choiceStatsByCard = new Map();
  let totalExports = 0;
  let resolvedRuns = 0;
  let winRuns = 0;
  let totalChoiceEvents = 0;

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.events)) continue;
    totalExports++;

    const outcome = parseRunOutcome(parsed.events);
    if (typeof outcome === 'boolean') {
      resolvedRuns++;
      if (outcome) winRuns++;
    }

    for (const event of parsed.events) {
      if (!event || event.name !== 'v2_event_card' || !event.payload || typeof event.payload !== 'object') continue;
      const payload = event.payload;
      const cardId = typeof payload.id === 'string' ? payload.id : 'unknown_card';
      const choice = typeof payload.choice === 'string' ? payload.choice : 'none';
      const branch = typeof payload.branch === 'string' ? payload.branch : 'other';
      if (choice === 'none') continue;

      totalChoiceEvents++;
      const stats = ensureChoiceStats(choiceStatsByCard, cardId, choice);
      stats.picks++;
      if (typeof outcome === 'boolean') {
        if (outcome) stats.wins++;
        else stats.losses++;
      }

      if (branch === 'success') stats.branches.success++;
      else if (branch === 'failure') stats.branches.failure++;
      else if (branch === 'neutral') stats.branches.neutral++;
      else stats.branches.other++;
    }
  }

  if (totalExports === 0) {
    console.error('No valid telemetry exports found.');
    process.exit(1);
  }

  const baselineWinRate = resolvedRuns > 0 ? winRuns / resolvedRuns : 0;

  console.log('Booty Hunt Telemetry Analysis');
  console.log('=============================');
  console.log(`Files scanned: ${files.length}`);
  console.log(`Valid exports: ${totalExports}`);
  console.log(`Resolved runs: ${resolvedRuns}`);
  console.log(`Baseline win rate: ${resolvedRuns > 0 ? pct(baselineWinRate) : 'n/a'}`);
  console.log(`Choice events: ${totalChoiceEvents}`);
  console.log('');

  const cardRows = [...choiceStatsByCard.entries()]
    .map(([cardId, byChoice]) => {
      const totalPicks = [...byChoice.values()].reduce((sum, entry) => sum + entry.picks, 0);
      return { cardId, byChoice, totalPicks };
    })
    .sort((a, b) => b.totalPicks - a.totalPicks);

  if (cardRows.length === 0) {
    console.log('No v2_event_card choice events found.');
    return;
  }

  console.log('Choice Pick Rates And Win Delta');
  console.log('-------------------------------');
  for (const row of cardRows) {
    console.log(`${row.cardId} (total picks: ${row.totalPicks})`);
    const choices = [...row.byChoice.entries()].sort((a, b) => b[1].picks - a[1].picks);
    for (const [choiceId, stats] of choices) {
      const pickRate = row.totalPicks > 0 ? stats.picks / row.totalPicks : 0;
      const resolved = stats.wins + stats.losses;
      const choiceWinRate = resolved > 0 ? stats.wins / resolved : null;
      const delta = choiceWinRate !== null ? choiceWinRate - baselineWinRate : null;
      const branchStr = `S:${stats.branches.success} F:${stats.branches.failure} N:${stats.branches.neutral}`;
      const winStr = choiceWinRate === null ? 'win n/a' : `win ${pct(choiceWinRate)} (${pctPointDelta(delta)})`;
      console.log(`  - ${choiceId.padEnd(22)} picks ${String(stats.picks).padStart(3)} (${pct(pickRate)}) | ${winStr} | ${branchStr}`);
    }
    console.log('');
  }
}

main();
