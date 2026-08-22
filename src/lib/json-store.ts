import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SETTINGS, type AppState } from './app-types';

const EMPTY_STATE: AppState = {
  version: 2,
  opportunities: [],
  scoreSnapshots: [],
  proposals: [],
  approvals: [],
  applications: [],
  jobs: [],
  reviews: [],
  deliveries: [],
  economicOutcomes: [],
  decisions: [],
  activities: [],
  conflicts: [],
  transitions: [],
  settings: DEFAULT_SETTINGS,
};

function dataPath(): string {
  return path.resolve(process.env.DATA_STORE_PATH || '.data/store.json');
}

export async function loadJsonState(): Promise<AppState> {
  try {
    const raw = await readFile(dataPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...EMPTY_STATE,
      ...parsed,
      version: 2,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      opportunities: parsed.opportunities || [],
      scoreSnapshots: parsed.scoreSnapshots || [],
      proposals: parsed.proposals || [],
      approvals: parsed.approvals || [],
      applications: parsed.applications || [],
      jobs: parsed.jobs || [],
      reviews: parsed.reviews || [],
      deliveries: parsed.deliveries || [],
      economicOutcomes: parsed.economicOutcomes || [],
      decisions: parsed.decisions || [],
      activities: parsed.activities || [],
      conflicts: parsed.conflicts || [],
      transitions: parsed.transitions || [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`Unable to read local state: ${(error as Error).message}`);
    }
    return structuredClone(EMPTY_STATE);
  }
}

export async function saveJsonState(state: AppState): Promise<void> {
  const target = dataPath();
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
}
