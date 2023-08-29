import * as ts from "typescript";
import fs from 'fs';
import * as path from 'path';
import { execSync } from "child_process";

export const getSourceFile = (
	filePath: string,
	scriptKind: ts.ScriptKind,
	content?: string,
) => ts.createSourceFile(
	filePath,
	content ? content : fs.existsSync(filePath) ? fs.readFileSync(filePath).toString() : '',
	ts.ScriptTarget.ES5,
	true,
	scriptKind
);

export const getScriptKind = (filePath: string): ts.ScriptKind => {
	return filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

export const getCommentText = (
	node: ts.Node
) => node.getStart() !== node.getFullStart()
		? node.getFullText().substring(0, node.getStart() - node.getFullStart())
		: '';

export const isCommentMultiLine = (comment: string): boolean => {
	return comment.trimLeft().startsWith('/*');
}

export const updateComment = (
	node: ts.Node,
	text: string,
	context: ts.TransformationContext
) => {
	// Comment also attaches to the first child, we must remove it recursively.
	let removeComments = (c: ts.Node) => {
		if (c.getFullStart() === node.getFullStart()) {
			ts.setTextRange(c, { pos: c.getStart(), end: c.getEnd() });
		}
		c = ts.visitEachChild(c, removeComments, context);
		return c;
	}

	if (node.getChildCount()) {
		ts.visitEachChild(node, removeComments, context);
	}

	ts.setTextRange(node, { pos: node.getStart(), end: node.getEnd() })

	ts.setSyntheticLeadingComments(node, [{
		pos: -1,
		end: -1,
		hasTrailingNewLine: false,
		text: isCommentMultiLine(text) ? text.replace(/\/\*|\*\//g, "") : text,
		kind: isCommentMultiLine(text) ? ts.SyntaxKind.MultiLineCommentTrivia : ts.SyntaxKind.SingleLineCommentTrivia
	}])
};

// export const hasBreakingLines = (comment: string) => {
// 	return comment.replace(/\t/g, '').replace(/\s/g, '').length > 1
// 		|| (comment.split('').every(char => char === '\n') && comment.split('\n').length > 1);
// };
export const hasBreakingLines = (comment: string) => {
	return comment.split('\n').filter(r => r === '').length > 1;
};

/**
 * @deprecated use markingBreakingLines()
 */
export const markingBreakingLinesInCommentTrivia = (comment: string, isHeader: boolean = false) => {
	const commentText = '... here should be a break line (remove me!) ...';
	const commentLengthWithoutLastBreakingLine = comment.length - 1;
	const markedBrs = (!isHeader ? comment.substring(1, commentLengthWithoutLastBreakingLine) : comment.substring(0, commentLengthWithoutLastBreakingLine))
		.split('\n')
		.map(br => br ? br : commentText);
	// console.log(markedBrs);
	const updatedComment = markedBrs.join('\n');
	const updateCommentWithoutLeadingComment = updatedComment.startsWith('//')
		? updatedComment.substring(2, updatedComment.length)
		: updatedComment;
	return updateCommentWithoutLeadingComment;
};

export const markingBreakingLines = (text: string): string => {
	const breaklineMarker = '// ... here should be a break line (remove me!) ...\n';
	const pattern = /(^[ \t]*\n)/gm;
	const result = text.replace(pattern, breaklineMarker);
	return result;
};

export const unmarkingBrakingLines = (result2: string) => {
	const pattern = /\/\/ ... here should be a break line \(remove me!\) .../g;
	const result = result2.replace(pattern, '');
	return result;
};

export const hasDuplicates = (array: ts.Statement[]) => {
	const imports = array
		.filter(st => ts.isImportDeclaration(st) || ts.isVariableStatement(st))
		.map((im) => (im as ts.ImportDeclaration)?.importClause?.name?.escapedText
			|| ((im as ts.VariableStatement)?.declarationList?.declarations[0]?.name as ts.Identifier)?.escapedText)
		.filter(ims => ims);
	return new Set(imports).size !== imports.length;
};

export const splitArrayIntoGroups = <T>(array: T[], groupSize: number): T[][] => {
	const result: T[][] = [];
	for (let i = 0; i < array.length; i += groupSize) {
		result.push(array.slice(i, i + groupSize));
	}
	return result;
}

export const formatPrettier = (filesToFormat: string[]) => {
	// execSync(`pnpm install prettier@3.0.1 -g`);
	for (const filesToFormatGroup of splitArrayIntoGroups(filesToFormat, 350)) {
		const res = execSync(`pnpm exec prettier --write ${filesToFormatGroup.map(f => `'${f}'`).join(' ')} --config typescript/.prettierrc.js`);
		//console.log(res.toString());
	}
}

export const fsVisitor = (
	pathToVisit: string,
	visitHandler: (filePath: string) => void,
	includeFiles: (file: string) => boolean = (file) => file.endsWith('.ts') || file.endsWith('.tsx'),
	excludeFolders: (path: string) => boolean = (path) => path.endsWith('dist') || path.endsWith('node_modules') || path.split('/').reverse()[0].startsWith('.'),
): void => {
	if (!fs.statSync(pathToVisit).isDirectory()) {
		visitHandler(pathToVisit);
		return;
	}

	const files = fs.readdirSync(pathToVisit);

	for (const file of files) {
		const filePath = path.join(pathToVisit, file);
		const stat = fs.statSync(filePath);

		if (stat.isDirectory() && !excludeFolders(filePath)) {
			fsVisitor(filePath, visitHandler, includeFiles, excludeFolders);
		} else if (includeFiles(file)) {
			visitHandler(filePath);
		}
	}
}
