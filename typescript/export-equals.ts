/**
 * This TS transformation allows to convert `export = ...` statements to
 * export default or export named (?).
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

const transformExportEquals = (filePath: string, pepDelimiter = '/dist') => {

	console.log(filePath);

	const scriptKind = getScriptKind(filePath);

	const sourceFileOrigin = getSourceFile(filePath, scriptKind);

	const sourceFileRawText = sourceFileOrigin.getFullText();

	// ts.transform drops all breaking line!
	// this should help to preserve them in the source file
	// it works only in correlation with unmarkingBrakingLines()
	// (i.e. source code is not valid after transformation until call unmarkingBrakingLines)
	const sourceFileTextMarkedBreaklines = markingBreakingLines(sourceFileRawText);

	const sourceFile = getSourceFile(filePath, scriptKind, sourceFileTextMarkedBreaklines);

	const checkExportEquals = (node: ts.Node): boolean => {
		if (ts.isExportAssignment(node)) {
			return true;
		}

		return false;
	}

	const replaceExportEquals = (node: ts.Node, context: ts.TransformationContext): ts.Node => {
		if (!ts.isExportAssignment(node)) {
			return node;
		}

		if (!node.isExportEquals) {
			return node;
		};

		return context.factory.createExportAssignment(undefined, false, node.expression);
	}

	const imports: ts.ImportDeclaration[] = [];

	const ExportEqualsTransformerFactory: ts.TransformerFactory<ts.SourceFile> = context => {
		return (sourceFile) => {
			const visitor = (node: ts.Node): ts.Node => {
				if (checkExportEquals(node)) {
					return replaceExportEquals(node, context);
				}
				return ts.visitEachChild(node, visitor, context);
			};

			return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
		};
	};

	const LoggingTransformerFactory: ts.TransformerFactory<ts.SourceFile> = context => {
		return (sourceFile) => {
			console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++')
			console.log(sourceFile.getFullText());
			console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++')
			return sourceFile;
		};
	};

	const transformationResult = ts.transform(
		sourceFile,
		[
			ExportEqualsTransformerFactory,
			// LoggingTransformerFactory,
		],
		{ newLine: ts.NewLineKind.LineFeed }
	);
	const transformedSourceFile = transformationResult.transformed[0];

	const transformedWithoutHeaderComment = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, })
		.printNode(
			ts.EmitHint.Unspecified,
			transformedSourceFile,
			sourceFile
		);


	const transformed = transformedWithoutHeaderComment;

	// console.log('============================')
	// console.log(transformed)
	// console.log('============================')

	const result = unmarkingBrakingLines(transformed);

	return result;
};

console.log('CWD:', process.cwd())

const dirPath = process.argv[2];
const format: boolean = process.argv[3] === '--format'
const idling: boolean = process.argv[3] === '--idling'

const filesToFormat: string[] = [];

fsVisitor(dirPath, (filePath) => {
	// transformation
	const transformedSourceFile = transformExportEquals(filePath);

	// save changes
	fs.writeFileSync(filePath, transformedSourceFile);

	filesToFormat.push(filePath);
});

if (format) {
	// format changes with prettier 
	// Run because ts doesn't support, for instance, ident formatting
	// pnpm install prettier -g
	formatPrettier(filesToFormat);
}