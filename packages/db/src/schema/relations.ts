import { relations } from 'drizzle-orm';
import { sessions, users } from './auth';
import { alerts, commands } from './operations';
import { stationSensors, stationState, stations } from './stations';
import { deviceHealth, readings } from './telemetry';

// Relations for drizzle's relational query API (db.query.*). They add no constraints.

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const stationsRelations = relations(stations, ({ one, many }) => ({
  state: one(stationState, { fields: [stations.id], references: [stationState.stationId] }),
  sensors: many(stationSensors),
  readings: many(readings),
  health: many(deviceHealth),
  commands: many(commands),
  alerts: many(alerts),
}));

export const stationStateRelations = relations(stationState, ({ one }) => ({
  station: one(stations, { fields: [stationState.stationId], references: [stations.id] }),
}));

export const stationSensorsRelations = relations(stationSensors, ({ one }) => ({
  station: one(stations, { fields: [stationSensors.stationId], references: [stations.id] }),
}));

export const readingsRelations = relations(readings, ({ one }) => ({
  station: one(stations, { fields: [readings.stationId], references: [stations.id] }),
}));

export const deviceHealthRelations = relations(deviceHealth, ({ one }) => ({
  station: one(stations, { fields: [deviceHealth.stationId], references: [stations.id] }),
}));

export const commandsRelations = relations(commands, ({ one }) => ({
  station: one(stations, { fields: [commands.stationId], references: [stations.id] }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  station: one(stations, { fields: [alerts.stationId], references: [stations.id] }),
}));
