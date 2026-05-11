import { clamp } from './utils.js';

export class Verifier {
  constructor(limits = {}) {
    this.limits = {
      minScore: clamp(Number(limits.minScore ?? 0.65), 0, 1),
      maxArtifacts: Number(limits.maxArtifacts ?? 20),
      maxRisks: Number(limits.maxRisks ?? 20),
      requireDeliverables: limits.requireDeliverables !== false,
    };
  }

  verify(runState) {
    const findings = [];
    const outputs = Array.isArray(runState.outputs) ? runState.outputs : [];
    const review = runState.review || {};
    const goal = String(runState.goal || '').toLowerCase();
    const toolCalls = Array.isArray(runState.toolCalls) ? runState.toolCalls : [];

    const deliverableCount = outputs.reduce((count, item) => {
      const deliverables = Array.isArray(item?.parsed?.deliverables) ? item.parsed.deliverables : [];
      return count + deliverables.length;
    }, 0);

    if (this.limits.requireDeliverables && deliverableCount === 0) {
      findings.push('No concrete deliverables were produced.');
    }

    if (deliverableCount > this.limits.maxArtifacts) {
      findings.push(`Deliverables exceed limit (${deliverableCount}/${this.limits.maxArtifacts}).`);
    }

    const riskCount = outputs.reduce((count, item) => {
      const risks = Array.isArray(item?.parsed?.risks) ? item.parsed.risks : [];
      return count + risks.length;
    }, 0);

    if (riskCount > this.limits.maxRisks) {
      findings.push(`Risk list is too large (${riskCount}/${this.limits.maxRisks}).`);
    }

    const isTimeSensitive = /(current|latest|today|now|ongoing|going on|live|right now|currently)/.test(goal);
    const isResearchLike = /(\?|search|lookup|look up|find|research|news|weather|temperature|capital|olympic|stock|price)/.test(goal);
    const completedToolCalls = toolCalls.filter((call) => call?.status === 'completed');
    const searchCalls = completedToolCalls.filter((call) => call?.name === 'web.search');
    const searchWithResults = searchCalls.filter((call) => {
      const results = Array.isArray(call?.result?.results) ? call.result.results : [];
      return results.length > 0;
    });
    const fetchCalls = completedToolCalls.filter((call) => call?.name === 'browser.fetch_page');
    const fetchWithText = fetchCalls.filter((call) => {
      const text = String(call?.result?.text || '').trim();
      return call?.result?.ok === true && text.length >= 160;
    });
    const nowCalls = completedToolCalls.filter((call) => call?.name === 'system.now');
    const evidenceStrongForResearch = searchWithResults.length > 0 || fetchWithText.length > 0;
    const evidenceStrongForTimeSensitive = fetchWithText.length > 0 || (nowCalls.length > 0 && searchWithResults.length > 0);
    const evidenceStrong = isTimeSensitive ? evidenceStrongForTimeSensitive : evidenceStrongForResearch;

    if (isResearchLike && completedToolCalls.length === 0) {
      findings.push('No tool evidence was collected for this research query.');
    }

    if (searchCalls.length > 0 && searchWithResults.length === 0 && fetchWithText.length === 0) {
      findings.push('Search calls returned no usable evidence.');
    }

    if (isTimeSensitive && fetchWithText.length === 0 && !(nowCalls.length > 0 && searchWithResults.length > 0)) {
      findings.push('Time-sensitive query lacks grounded evidence (system.now + search or fetched page text).');
    }

    const score = clamp(Number(review.score ?? 0), 0, 1);
    if (!evidenceStrong) {
      if (score < this.limits.minScore) {
        findings.push(`Review score below threshold (${score.toFixed(2)} < ${this.limits.minScore.toFixed(2)}).`);
      }

      if (String(review.status || '').toLowerCase() === 'revise') {
        findings.push('Reviewer requested revisions.');
      }
    }

    return {
      passed: findings.length === 0,
      findings,
      score,
    };
  }
}
