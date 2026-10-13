'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/server');

const BASELINE_INPUTS = { initiative: { mode: 'jira', key: 'COM-1' }, epic: { mode: 'jira', key: 'COM-10' }, codebase: { mode: 'sample', branch: 'demo/commission-engine' } };
const INCREMENT_INPUTS = { epic: { mode: 'jira', key: 'COM-20' }, codebase: { mode: 'sample', branch: 'demo/commission-engine-v2' } };

const HOTEL_EPICS = 'AQPI-2, AQPI-6, AQPI-10, AQPI-14, AQPI-18, AQPI-23, AQPI-27';
const HOTEL_INPUTS = { initiative: { mode: 'jira', key: 'AQPI-1' }, epic: { mode: 'jira', key: HOTEL_EPICS }, codebase: { mode: 'sample', branch: 'demo/hotel-booking-platform' } };
const HOTEL_V2_INPUTS = { epic: { mode: 'jira', key: 'AQPI-32, AQPI-23', snapshot: 'release-2.0' }, codebase: { mode: 'sample', branch: 'demo/hotel-booking-platform-v2' } };

const tmpDir = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `aqe-${label}-`));

async function baselineCycle(pipeline, store, { reviewer = 'Priya Shah', pick = '1.5 %', testingType } = {}) {
  let c = await pipeline.startCycle({ type: 'baseline', inputs: BASELINE_INPUTS, reviewer, testingType });
  const conflict = c.normalisation.groups.find((g) => g.bucket === 'conflict');
  const opt = conflict && conflict.options.find((o) => o.signature === pick);
  const { done } = pipeline.review(c.id, { reviewer, resolutions: conflict ? { [conflict.id]: opt.optionId } : {} });
  await done;
  c = store.getCycle(c.id);
  return c;
}

async function incrementalDesign(pipeline, store, baselineId, reviewer = 'Priya Shah', testingType = undefined) {
  const c = await pipeline.startCycle({ type: 'incremental', baselineId, inputs: INCREMENT_INPUTS, reviewer, testingType });
  const { done } = pipeline.review(c.id, { reviewer });
  await done;
  return store.getCycle(c.id);
}

/** Runs both flows end to end (real Playwright execution twice). */
async function bothFlows(dataDir = tmpDir('flows')) {
  const ctx = createApp({ dataDir, env: {} });
  const c1 = await baselineCycle(ctx.pipeline, ctx.store);
  const designed = await incrementalDesign(ctx.pipeline, ctx.store, c1.baselineId);
  const baselineBeforeMerge = ctx.store.getBaseline(c1.baselineId);
  const { done } = ctx.pipeline.decideMerge(designed.id, { decision: 'approve', approver: 'Sam Lee' });
  await done;
  const c2 = ctx.store.getCycle(designed.id);
  return { ...ctx, dataDir, c1, designed, c2, baselineBeforeMerge };
}

module.exports = { BASELINE_INPUTS, INCREMENT_INPUTS, HOTEL_EPICS, HOTEL_INPUTS, HOTEL_V2_INPUTS, tmpDir, baselineCycle, incrementalDesign, bothFlows };
