import * as fs from 'fs';
import * as path from 'path';

function getTSFilePaths(dir: string, fileList: string[] = []): string[] {
	const files = fs.readdirSync(dir);

	for (const file of files) {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);

		if (stat.isDirectory()) {
			getTSFilePaths(filePath, fileList);
		} else if (filePath.endsWith('.ts')) {
			fileList.push(filePath);
		}
	}

	return fileList;
}

const targetDirectory = '/path/to/your/directory'; // Replace this with the path to the directory you want to traverse
const tsFilePaths = getTSFilePaths(targetDirectory);

console.log('List of TypeScript files:');
console.log(tsFilePaths.join('\n'));
