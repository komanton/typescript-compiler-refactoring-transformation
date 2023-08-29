/**
 * This TS transformation allows to convert (usually for legacy js code) `require('@comp/somemodule')` to require('@comp/somemodule').default statements to
 * export default or export named (?).
 * 
 * Command: pnpm exec ts-node typescript/require-default.ts modules/
 */

import * as ts from "typescript";
import * as fs from "fs";

import {
	getSourceFile,
	getScriptKind,
	fsVisitor,
	unmarkingBrakingLines,
	hasDuplicates,
	isCommentMultiLine,
	markingBreakingLines,
	getCommentText,
	splitArrayIntoGroups,
	formatPrettier
} from "./utils";

const transformRequireDefault = (filePath: string) => {

	console.log(filePath);

	const scriptKind = getScriptKind(filePath);

	const sourceFileOrigin = getSourceFile(filePath, scriptKind);

	const sourceFileRawText = sourceFileOrigin.getFullText();

	const regex = /require\((['"])(?:@|\.\/).*?\1\)/g;
	const modifiedCode = sourceFileRawText.replace(regex, "$&.default || $&");

	return modifiedCode;
};

console.log('CWD:', process.cwd())

const dirPath = process.argv[2];
const ext: string = process.argv[3] as string || 'ts'
const includes: string = process.argv[4] as string || ''

fsVisitor(dirPath, (filePath) => {
	if (includes.length && !includes.split(',').some(inc => filePath.endsWith(inc))) {
		return;
	}

	// transformation
	const transformedSourceFile = transformRequireDefault(filePath);

	// save changes
	fs.writeFileSync(filePath, transformedSourceFile);
}, (file) => file.endsWith(`.${ext}`) || file.endsWith(`.${ext}x`));
