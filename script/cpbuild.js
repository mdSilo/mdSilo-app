const cpy = require('cpy');

(async () => {
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
