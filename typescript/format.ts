import { formatPrettier, fsVisitor } from "./utils";

console.log('CWD:', process.cwd())

const dirPath = process.argv[2];

const filesToFormat: string[] = [];

fsVisitor(dirPath, (filePath) => {
	filesToFormat.push(filePath);
});

formatPrettier(filesToFormat);