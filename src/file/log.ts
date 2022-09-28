import * as Storage from './storage';

type LogItem = {
  type: string;
  info: string;
  timestamp: Date;
};

/**
 * Write a log
 * @param {string} type - log type: info, error, warning, ..
 * @param {string} info - log information
 * @returns {Promise<void>}
 */
export const Log = async (type: string, info: string): Promise<void> => {
	const log: { logs: LogItem[] } = await Storage.get('log');
	const preLogs: LogItem[] = log?.logs ?? [];
	log.logs = [...preLogs, { type, info, timestamp: new Date() }];
	await Storage.set('log', log);
};

/**
 * Get the logs 
 * @returns {Promise<LogItem[]>}
 */
 export const getLog = async (): Promise<LogItem[]> => {
	const log: { logs: LogItem[] } = await Storage.get('log');
	return log.logs;
};
