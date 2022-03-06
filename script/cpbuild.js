//import { cpy } from 'cpy';
//const cpy = require('cpy');

(async () => {
	//const { cpy } = await import('cpy');
	const cpy = require('cpy');
	await cpy(
		[
			'src/**/*',
			'!src/**/*.ts',
			'src/lib/**/*',
		],
		'build',
		{
			parents: true,
		}
	);
})();
