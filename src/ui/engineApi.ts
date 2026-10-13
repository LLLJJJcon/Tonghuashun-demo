// 前端与规则引擎的唯一对接点：所有业务结果都来自 src/engine/index.ts
export { derive, validate, nextCheckpoint, prevCheckpoint, eventCheckpoints, labels } from '../engine';
