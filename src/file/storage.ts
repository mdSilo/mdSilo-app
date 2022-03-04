/* eslint-disable @typescript-eslint/no-explicit-any */
import { invoke } from '@tauri-apps/api/tauri'
import { isTauri } from './util';

interface StorageData {
	status: boolean;
	data: JSON;
}

export interface LocalData {
	[key: string]: any;
}

const DATA: LocalData = {};

/**
 * Set data to local storage
 * @param {string} key 
 * @param {any} data 
 * @returns {Promise<void>}
 */
export const set = async (key: string, value: any): Promise<void> => {
	if (isTauri) {
		DATA[key] = value;
		return await invoke('set_data', { key, value });
	} else {
		DATA[key] = value;
		localStorage.setItem(key, JSON.stringify(value));
	}
};

/**
 * Get data from local storage
 * @param {string} key 
 * @param {boolean} force 
 * @returns {Promise<any>} 
 */
export const get = async (key: string, force?: boolean): Promise<JSON | any> => {
	if (Object.keys(DATA).includes(key) && !force) {
		return DATA[key];
	} else {
		if (isTauri) {
			const storeData: StorageData = await invoke('get_data', { key });
			const sData = storeData.data;
			DATA[key] = sData;
			return storeData.status ? sData : {};
		} else {
			const storeData = localStorage.getItem(key);
			if (storeData) {
				const sData = JSON.parse(storeData);
				DATA[key] = sData;
				return sData;
			} else {
				return {};
			}
		}
	}
};

/**
 * Remove data in local storage
 * @param {string} key
 * @returns {any}
 */
export const remove = async (key: string): Promise<void> => {
	if (isTauri) {
		await invoke('delete_data', { key });
	} else {
		localStorage.removeItem(key);
	}
};

// eslint-disable-next-line import/no-anonymous-default-export
export default { set, get, remove };
