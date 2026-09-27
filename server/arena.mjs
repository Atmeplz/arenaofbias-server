// Blind comparisons and the leaderboard.
//
// The server draws every pair, so a voter never chooses what to vote on. A match carries two
// opaque content tokens; the frames load from those tokens, so neither the page nor the
// frame address reveals which work (or model) is on which side until the vote is in.
//
// Sampling follows arenaofbias: first two different entries (model + effort), then one work
// of each, so an entry with many works is not shown more often. Pairs are weighted towards
// entries with few comparisons, prefer entries of similar strength, and avoid the previous
// round's works, the voter's own uploads and pairs the voter has already judged.
import { randomBytes } from 'node:crypto';
import { entityKey } from './catalog.mjs';
import { transaction } from './db.mjs';
import { fail } from './http.mjs';
import { rankEntries } from './ranking.mjs';

const MATCH = { tierWidth: 150, sameTierRate: 0.9, blowoutGap: 400, rerolls: 2 };
export const pairKey = (taskId, a, b) => `${taskId}:${[a, b].sort().join('+')}`;
const token = () => `m${randomBytes(16).toString('hex')}`;

export function createArena({ db, catalog, library, limits, random = Math.random }) {
  const q = {
    insertMatch: db.prepare('INSERT INTO matches (id, user_id, task_id, a_work, b_work, a_token, b_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    match: db.prepare('SELECT * FROM matches WHERE id = ?'),
    lastMatch: db.prepare('SELECT * FROM matches WHERE user_id = ? AND task_id = ? ORDER BY created_at DESC LIMIT 1'),
    matchByToken: db.prepare('SELECT * FROM matches WHERE (a_token = ? OR b_token = ?) AND expires_at > ?'),
    decide: db.prepare('UPDATE matches SET choice = ?, decided_at = ? WHERE id = ? AND choice IS NULL'),
    purge: db.prepare('DELETE FROM matches WHERE expires_at < ? AND id NOT IN (SELECT match_id FROM votes)'),
    insertVote: db.prepare('INSERT INTO votes (id, match_id, user_id, task_id, a_work, b_work, pair_key, choice, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    votedPair: db.prepare('SELECT 1 FROM votes WHERE user_id = ? AND pair_key = ?'),
    votedPairs: db.prepare('SELECT pair_key FROM votes WHERE user_id = ? AND task_id = ?'),
    votes: db.prepare('SELECT * FROM votes ORDER BY created_at'),
    votesOfTask: db.prepare('SELECT * FROM votes WHERE task_id = ? ORDER BY created_at'),
    userVotes: db.prepare('SELECT COUNT(*) AS n FROM votes WHERE user_id = ?'),
  };

  // The leaderboard only changes when votes or work states change; callers invalidate.
  let cache = new Map();
  const invalidate = () => { cache = new Map(); };

  // Votes that still count: both works are verified and present now. Questioning or deleting
  // a work removes its votes from the ranking; restoring it brings them back.
  function countedVotes(taskId) {
    const works = new Map();
    const lookup = (task, id) => {
      const key = `${task}/${id}`;
      if (!works.has(key)) {
        const work = library.work(task, id);
        works.set(key, library.isEligible(work) ? work : null);
      }
      return works.get(key);
    };
    const votes = [];
    for (const row of taskId ? q.votesOfTask.all(taskId) : q.votes.all()) {
      const a = lookup(row.task_id, row.a_work);
      const b = lookup(row.task_id, row.b_work);
      if (a && b) votes.push({ a, b, choice: row.choice, userId: row.user_id ?? `vote:${row.id}` });
    }
    return votes;
  }

  const describe = (work, by) => ({
    model: work.modelId,
    modelName: work.modelName,
    vendor: work.vendor,
    effort: by === 'model' ? '' : work.effort,
  });

  function leaderboard({ task = null, by = 'config' } = {}) {
    catalog.refresh();
    const cacheKey = `${catalog.version}|${task ?? '*'}|${by}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const keyOf = (work) => entityKey(work, by);
    const votes = countedVotes(task);
    const ranked = rankEntries(votes, keyOf, limits);
    const pool = task ? library.eligible(task) : catalog.tasks().flatMap((t) => library.eligible(t.id));
    const works = new Map();
    for (const work of pool) {
      const key = keyOf(work);
      if (!works.has(key)) works.set(key, { sample: work, count: 0 });
      works.get(key).count++;
    }
    const rankedKeys = new Set(ranked.map((row) => row.key));
    const result = {
      task,
      by,
      totals: { votes: votes.length, voters: new Set(votes.map((vote) => vote.userId)).size, entries: ranked.length },
      rows: ranked.map((row, i) => ({
        rank: i + 1,
        key: row.key,
        ...describe(row.sample, by),
        score: row.score,
        interval: row.interval,
        games: row.games,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        winRate: row.winRate,
        voters: row.voters,
        tasks: row.tasks,
        works: works.get(row.key)?.count ?? 0,
        provisional: row.provisional,
      })),
      unranked: [...works].filter(([key]) => !rankedKeys.has(key)).map(([key, { sample, count }]) => ({ key, ...describe(sample, by), works: count }))
        .sort((a, b) => a.modelName.localeCompare(b.modelName, 'en', { numeric: true }) || a.effort.localeCompare(b.effort)),
      provisionalGames: limits.provisionalGames,
      updatedAt: new Date().toISOString(),
    };
    cache.set(cacheKey, result);
    return result;
  }

  function candidatesFor(taskId, groups, voted, avoid) {
    const keys = [...groups.keys()];
    const candidates = [];
    for (let i = 0; i < keys.length; i++) {
      const left = groups.get(keys[i]).filter((work) => !avoid.has(work.id));
      for (let j = i + 1; j < keys.length; j++) {
        const right = groups.get(keys[j]).filter((work) => !avoid.has(work.id));
        const pairs = [];
        for (const a of left) for (const b of right) if (!voted.has(pairKey(taskId, a.id, b.id))) pairs.push([a, b]);
        if (pairs.length) candidates.push({ keys: [keys[i], keys[j]], pairs });
      }
    }
    return candidates;
  }

  function pick(candidates, board) {
    const rating = new Map(board.rows.map((row) => [row.key, row.score]));
    const games = new Map(board.rows.map((row) => [row.key, row.games]));
    const score = (key) => rating.get(key) ?? 1000;
    const tier = (key) => Math.floor(score(key) / MATCH.tierWidth);
    // Cold start first (arenaofbias 109): the fewer comparisons the rarer entry has, the likelier.
    const weight = ({ keys }) => 1 / (1 + Math.min(games.get(keys[0]) ?? 0, games.get(keys[1]) ?? 0));
    const roulette = (list) => {
      let ticket = random() * list.reduce((sum, candidate) => sum + weight(candidate), 0);
      for (const candidate of list) if ((ticket -= weight(candidate)) <= 0) return candidate;
      return list[list.length - 1];
    };
    // Soft matching (arenaofbias 046): mostly entries in the same strength band, never forced.
    const sameTier = candidates.filter(({ keys }) => tier(keys[0]) === tier(keys[1]));
    const list = sameTier.length && random() < MATCH.sameTierRate ? sameTier : candidates;
    let chosen = roulette(list);
    const gap = ({ keys }) => Math.abs(score(keys[0]) - score(keys[1]));
    for (let i = 0; i < MATCH.rerolls && gap(chosen) > MATCH.blowoutGap; i++) chosen = roulette(list);
    return chosen;
  }

  function poolStats(taskId) {
    const works = library.eligible(taskId);
    return { works: works.length, entries: new Set(works.map((work) => entityKey(work))).size };
  }

  return {
    invalidate,
    leaderboard,
    poolStats,

    createMatch(user, taskId, previousId) {
      if (!catalog.task(taskId)) fail(404, '题目不存在');
      if (random() < 0.02) q.purge.run(Date.now() - 24 * 3600e3);
      const groups = new Map();
      for (const work of library.eligible(taskId)) {
        if (user && work.ownerId === user.id) continue;
        const key = entityKey(work);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(work);
      }
      if (groups.size < 2) fail(409, '这道题还没有两个不同模型配置的已验证作品', 'insufficient');
      const voted = new Set(user ? q.votedPairs.all(user.id, taskId).map((row) => row.pair_key) : []);
      const previous = previousId ? q.match.get(String(previousId)) : user ? q.lastMatch.get(user.id, taskId) : null;
      const avoid = new Set(previous?.task_id === taskId ? [previous.a_work, previous.b_work] : []);
      let candidates = candidatesFor(taskId, groups, voted, avoid);
      if (!candidates.length && avoid.size) candidates = candidatesFor(taskId, groups, voted, new Set());
      if (!candidates.length) fail(409, '这道题的组合你都已经评过了，换一道题试试', 'exhausted');

      const chosen = pick(candidates, leaderboard({ task: taskId }));
      const [first, second] = chosen.pairs[Math.floor(random() * chosen.pairs.length)];
      const [a, b] = random() < 0.5 ? [first, second] : [second, first];
      const id = randomBytes(12).toString('hex');
      const now = Date.now();
      const tokens = [token(), token()];
      q.insertMatch.run(id, user?.id ?? null, taskId, a.id, b.id, tokens[0], tokens[1], now, now + limits.matchTtl);
      return {
        id,
        task: taskId,
        a: `${library.originOf(tokens[0])}/`,
        b: `${library.originOf(tokens[1])}/`,
        counted: Boolean(user),
      };
    },

    vote(user, matchId, choice) {
      const match = q.match.get(String(matchId ?? ''));
      if (!match || match.expires_at <= Date.now() || (match.user_id && match.user_id !== user?.id)) fail(404, '这一组已经失效，请开始新的一组');
      if (match.choice) fail(409, '这一组已经提交过了');
      if (!['a', 'b', 'tie', 'skip'].includes(choice)) fail(400, '选择无效');
      const a = library.work(match.task_id, match.a_work);
      const b = library.work(match.task_id, match.b_work);
      let counted = false;
      let reason = choice === 'skip' ? 'skipped' : '';
      transaction(db, () => {
        q.decide.run(choice, Date.now(), match.id);
        if (choice === 'skip') return;
        if (!user) { reason = 'anonymous'; return; }
        if (!library.isEligible(a) || !library.isEligible(b)) { reason = 'changed'; return; }
        if (a.ownerId === user.id || b.ownerId === user.id) { reason = 'own'; return; }
        const key = pairKey(match.task_id, match.a_work, match.b_work);
        if (q.votedPair.get(user.id, key)) { reason = 'duplicate'; return; }
        q.insertVote.run(randomBytes(12).toString('hex'), match.id, user.id, match.task_id, match.a_work, match.b_work, key, choice, Date.now());
        counted = true;
      });
      if (counted) invalidate();
      const reveal = (work) => (work ? library.toPublic(work, user) : null);
      return { choice, counted, reason, a: reveal(a), b: reveal(b) };
    },

    // The work behind a match token, for the content server.
    workForToken(key) {
      const match = q.matchByToken.get(key, key, Date.now());
      if (!match) return null;
      return library.work(match.task_id, match.a_token === key ? match.a_work : match.b_work);
    },

    votesBy: (userId) => q.userVotes.get(userId).n,
  };
}
