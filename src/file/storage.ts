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

/**
 * Set data to local storage
 * @param {string} key 
 * @param {any} value 
 * @returns {Promise<void>}
 */
export const set = async (key: string, value: any): Promise<void> => {
	if (isTauri) {
		return await invoke('set_data', { key, value });
	} else {
		localStorage.setItem(key, JSON.stringify(value));
	}
};

/**
 * Get data from local storage
 * @param {string} key 
 * @returns {Promise<any>} 
 */
export const get = async (key: string): Promise<JSON | any> => {
	if (isTauri) {
		const storeData: StorageData = await invoke('get_data', { key });
		return storeData.status ? storeData.data : {};
	} else {
		const storeData = localStorage.getItem(key);
		return storeData ? JSON.parse(storeData) : {};
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
