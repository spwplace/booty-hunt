import regionsRaw from './data/regions.v2.json';
import factionsRaw from './data/factions.v2.json';
import eventsRaw from './data/events.v2.json';
import doctrinesRaw from './data/doctrines.v2.json';

export interface V2Region {
  id: string;
  name: string;
  theme: string;
  weatherBias: string[];
  hazards: string[];
  factionPressure: string[];
  eventDeckBias: string[];
  musicMood: string;
}

export interface V2Faction {
  id: string;
  name: string;
  combatProfile: string;
  economicProfile: string;
  narrativeVoice: string;
  spawnWeight: number;
  startingReputation: number;
}

export interface V2EventCard {
  id: string;
  name: string;
  tier: 'global' | 'region' | 'faction' | 'crew';
  region: string;
  factions: string[];
  trigger: string;
  payload: string;
  rarity: number;
  cooldownSec: number;
}

export interface V2Doctrine {
  id: string;
  name: string;
  summary: string;
  startingBonuses: {
    speedMult: number;
    cannonDamageMult: number;
    maxHealthMult: number;
  };
}

export interface V2ContentData {
  regions: V2Region[];
  factions: V2Faction[];
  events: V2EventCard[];
  doctrines: V2Doctrine[];
}

const VALID_WEATHER_BIAS = new Set(['clear', 'foggy', 'stormy', 'night']);

function assertUniqueIds<T extends { id: string }>(label: string, items: T[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new Error(`Duplicate ${label} id: ${item.id}`);
    }
    seen.add(item.id);
  }
}

function assertContentIntegrity(data: V2ContentData): void {
  const regionIds = new Set(data.regions.map((region) => region.id));
  const factionIds = new Set(data.factions.map((faction) => faction.id));
  const eventIds = new Set(data.events.map((event) => event.id));

  for (const region of data.regions) {
    if (region.weatherBias.length === 0) {
      throw new Error(`Region ${region.id} is missing weatherBias entries.`);
    }
    for (const weather of region.weatherBias) {
      if (!VALID_WEATHER_BIAS.has(weather)) {
        throw new Error(`Region ${region.id} references invalid weather "${weather}".`);
      }
    }

    if (region.factionPressure.length === 0) {
      throw new Error(`Region ${region.id} must reference at least one faction.`);
    }
    for (const factionId of region.factionPressure) {
      if (!factionIds.has(factionId)) {
        throw new Error(`Region ${region.id} references unknown faction "${factionId}".`);
      }
    }

    for (const eventId of region.eventDeckBias) {
      if (!eventIds.has(eventId)) {
        throw new Error(`Region ${region.id} references unknown event card "${eventId}".`);
      }
    }
  }

  for (const faction of data.factions) {
    if (faction.spawnWeight <= 0) {
      throw new Error(`Faction ${faction.id} must have spawnWeight > 0.`);
    }
  }

  for (const eventCard of data.events) {
    if (eventCard.region !== "global" && !regionIds.has(eventCard.region)) {
      throw new Error(`Event ${eventCard.id} references unknown region "${eventCard.region}".`);
    }
    for (const factionId of eventCard.factions) {
      if (!factionIds.has(factionId)) {
        throw new Error(`Event ${eventCard.id} references unknown faction "${factionId}".`);
      }
    }
    if (eventCard.rarity <= 0 || eventCard.rarity > 1) {
      throw new Error(`Event ${eventCard.id} must have rarity in (0, 1].`);
    }
    if (eventCard.cooldownSec <= 0) {
      throw new Error(`Event ${eventCard.id} must have cooldownSec > 0.`);
    }
    if (!eventCard.trigger.trim()) {
      throw new Error(`Event ${eventCard.id} must define a non-empty trigger.`);
    }
    if (!eventCard.payload.trim()) {
      throw new Error(`Event ${eventCard.id} must define a non-empty payload.`);
    }
  }

  for (const doctrine of data.doctrines) {
    const bonuses = doctrine.startingBonuses;
    if (bonuses.speedMult <= 0 || bonuses.cannonDamageMult <= 0 || bonuses.maxHealthMult <= 0) {
      throw new Error(`Doctrine ${doctrine.id} has invalid startingBonuses (must all be > 0).`);
    }
  }
}

function parseContent(): V2ContentData {
  const regions = regionsRaw as V2Region[];
  const factions = factionsRaw as V2Faction[];
  const events = eventsRaw as V2EventCard[];
  const doctrines = doctrinesRaw as V2Doctrine[];

  assertUniqueIds('region', regions);
  assertUniqueIds('faction', factions);
  assertUniqueIds('event', events);
  assertUniqueIds('doctrine', doctrines);

  if (regions.length === 0 || factions.length === 0 || events.length === 0 || doctrines.length === 0) {
    throw new Error('V2 content is missing required records.');
  }

  const data = { regions, factions, events, doctrines };
  assertContentIntegrity(data);
  return data;
}

export class V2ContentRegistry {
  readonly data: V2ContentData;
  readonly regionsById: Map<string, V2Region>;
  readonly factionsById: Map<string, V2Faction>;

  constructor(data: V2ContentData) {
    this.data = data;
    this.regionsById = new Map(data.regions.map(region => [region.id, region]));
    this.factionsById = new Map(data.factions.map(faction => [faction.id, faction]));
  }

  static createDefault(): V2ContentRegistry {
    return new V2ContentRegistry(parseContent());
  }

  getRegion(id: string): V2Region | null {
    return this.regionsById.get(id) ?? null;
  }

  getFaction(id: string): V2Faction | null {
    return this.factionsById.get(id) ?? null;
  }
}
