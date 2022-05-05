
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace FileSystemAccess {

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export function support(obj: any & Window): boolean {
		if (typeof obj?.showDirectoryPicker === 'function') {
			return true;
		}

		return false;
	}
}
