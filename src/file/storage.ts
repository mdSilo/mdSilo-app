import { invoke } from '@tauri-apps/api/tauri'
import { isTauri } from './util';

interface StorageData {
	status: boolean;
	data: JSON;
}

const data: { [key: string]: any; } = {};

/**
 * Set data to local storage
 * @param {string} key 
 * @param {any} data 
 * @returns {Promise<void>}
 */
export const set = async (key: string, value: any): Promise<void> => {
	if (isTauri) {
		data[key] = value;
		console.log("go here??")
		return await invoke('set_data', { key, value });
	} else {
		data[key] = value;
		localStorage.setItem(key, JSON.stringify(value));
	}
};

/**
 * Get data from local storage
 * @param {string} key 
 * @param {boolean} force 
 * @returns {Promise<any>} 
 */
export const get = async (key: string, force?: boolean): Promise<any> => {
	if (Object.keys(data).includes(key) && !force) {
		return data[key];
	} else {
		if (isTauri) {
			const storeData: StorageData = await invoke('get_data', { key });
			data[key] = storeData.data;
			return storeData.status ? storeData.data : {};
		} else {
			const storeData = localStorage.getItem(key);
			if (storeData) {
				data[key] = JSON.parse(storeData);
				return data[key];
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
