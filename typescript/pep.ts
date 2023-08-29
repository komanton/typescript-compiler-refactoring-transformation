/**
 * This TS transformation allows to convert `import ... from @company/module/dist/some-mod...` statements to
 * named imports statements imported from the primary entry point (pep) (i.e. main field in package.json or src/index.ts),
 * for instance, `import { SomeMod } from @company/module`.
 */

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

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

const transformImportToPep = (
	filePath: string,
	modulesStore = 'node_modules',
	pepDelimiter = '/dist'
) => {

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

	const checkImportForPep = (node: ts.Node): boolean => {
		if (!ts.isImportDeclaration(node)) {
			return false;
		}

		const modulePath = node.moduleSpecifier.getText()
		if (!modulePath) {
			return false;
		}

		if (modulePath.includes(pepDelimiter)) {
			return true;
		}

		return false;
	}

	const replaceImportWithPep = (node: ts.Node, context: ts.TransformationContext): ts.Node => {
		if (!ts.isImportDeclaration(node)) {
			return node;
		}

		const modulePath = (node.moduleSpecifier as ts.StringLiteral).text;
		const moduleImportClause = node.importClause;

		if (!modulePath) {
			return node;
		}

		if (!modulePath.includes(pepDelimiter)) {
			return node;
		}

		const modulePathParts = modulePath.split(pepDelimiter);
		const pep = modulePathParts[0]; // ex: @comp/components
		const pathInsidePep = modulePathParts[1];

		let nodeImport: ts.Node = node;

		// TODO 
		// 1. default import converts to named import
		const defaultImport = moduleImportClause?.name;

		if (defaultImport) {
			const pepModuleSpecifier = context.factory.createStringLiteral(pep, true);

			nodeImport = context.factory.updateImportDeclaration(
				node,
				node.modifiers,
				context.factory.createImportClause(
					false,
					undefined,
					context.factory.createNamedImports([
						context.factory.createImportSpecifier(
							false, undefined, context.factory.createIdentifier(defaultImport.text))
					])),
				pepModuleSpecifier,
				undefined
			);
		}
		// 2. named import is the same
		const namedImport = moduleImportClause?.namedBindings;
		// 3. polyfill import should ignore
		const isPolyfillImport = moduleImportClause === undefined;

		console.log(node.getText())

		if (defaultImport) {
			/** Seed pep file with named export */
			/////////////////////////////////////////////

			// pnpm use symlinks, so we should reach pep file here
			const pepRealPath = path.join(modulesStore, pep, '/src');
			const pepRealFilePath = fs.existsSync(pepRealPath + '/index.tsx')
				? pepRealPath + '/index.tsx'
				: pepRealPath + '/index.ts';

			const filesToFormat: string[] = [pepRealFilePath];

			// transformation
			const transformedSourceFile = transformPep(defaultImport, pepRealFilePath, pathInsidePep);

			// save changes
			fs.writeFileSync(pepRealFilePath, transformedSourceFile);

			/////////////////////////////////////////////
		}

		return nodeImport;
	}

	const PepImportTransformerFactory: ts.TransformerFactory<ts.SourceFile> = context => {
		return (sourceFile) => {
			const visitor = (node: ts.Node): ts.Node => {
				if (checkImportForPep(node)) {
					return replaceImportWithPep(node, context);
				}
				return ts.visitEachChild(node, visitor, context);
			};

			return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
		};
	};

	let headerComments = '';

	const transformationResult = ts.transform(
		sourceFile,
		[
			PepImportTransformerFactory,
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


	const transformed = headerComments + transformedWithoutHeaderComment;

	// console.log('============================')
	// console.log(transformed)
	// console.log('============================')

	const result = unmarkingBrakingLines(transformed);

	return result;
};

const transformPep = (
	modulesForReExport: ts.Identifier | ts.NamedImportBindings,
	filePath: string,
	pathInsidePep: string,
) => {

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


	const imports: ts.ImportDeclaration[] = [];

	const NamedExportTransformerFactory: ts.TransformerFactory<ts.SourceFile> = context => {
		return (sourceFile) => {


			const relativeNameImportImport = context.factory.createImportDeclaration(
				undefined,
				context.factory.createImportClause(
					false,
					undefined,
					context.factory.createNamedImports([
						context.factory.createImportSpecifier(
							false, undefined, context.factory.createIdentifier((modulesForReExport as ts.Identifier).text))
					])),
				context.factory.createStringLiteral('.' + pathInsidePep, true),
			);


			const nameModuleForExport = (modulesForReExport as ts.Identifier).text;

			// ex: import TestModule from './relative/path';
			const relativeDefaultImport = context.factory.createImportDeclaration(
				/* modifiers */ undefined,
				context.factory.createImportClause(
					false,
					context.factory.createIdentifier(nameModuleForExport),
					undefined),
				context.factory.createStringLiteral('.' + pathInsidePep, true)
			);

			const namedExport = context.factory.createExportDeclaration(
				undefined, false,
				context.factory.createNamedExports([
					context.factory.createExportSpecifier(false, undefined, nameModuleForExport)
				]))

			let allStatements: ts.Statement[] = [];

			// TODO preserve comments at the place where Statement is modified
			// but in case of require() replacement, only header comment is important
			const headerStatement = sourceFile.getSourceFile().statements[0]
			try {
				// it can be a new just created statement in previous transformation without comment
				// so it may not have a position in origin source file
				getCommentText(sourceFile.getSourceFile().statements[0]);
				// so its old statement with original comment, no need to care about header comment
			} catch {
				// but source  file is not modified, it should have header comment
				headerComments = getCommentText(sourceFile.getSourceFile());
			}

			const originalStatements = sourceFile.getSourceFile().statements;

			allStatements = originalStatements.length > 1 ? [
				headerStatement, // lets put header first, it may have original comment
				...[relativeDefaultImport],
				...originalStatements.slice(1),
				namedExport,
			] : [
				...[relativeDefaultImport],
				...originalStatements,
				namedExport,

			];

			// TODO check unique import and append named import from the same relative path
			// append export to existed named export


			if (hasDuplicates(allStatements)) {
				throw new Error(`Imports declaration collision in the file: [${sourceFile.fileName}]`)
			}

			return context.factory.updateSourceFile(sourceFile.getSourceFile(), allStatements);
		};
	};

	let headerComments = '';

	const transformationResult = ts.transform(
		sourceFile,
		[
			NamedExportTransformerFactory,
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


	const transformed = headerComments + transformedWithoutHeaderComment;

	// console.log('============================')
	// console.log(transformed)
	// console.log('============================')

	const result = unmarkingBrakingLines(transformed);



	return result;
};

console.log('CWD:', process.cwd())

const dirPath = process.argv[2];
const format: boolean = process.argv[3] === '--format'
const modulesStore: string = process.argv[4]

const filesToFormat: string[] = [];

fsVisitor(dirPath, (filePath) => {
	// transformation
	const transformedSourceFile = transformImportToPep(filePath, modulesStore);

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