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

const transformRequireToImport = (filePath: string, idling: boolean = false) => {

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

	const checkRequire = (node: ts.Node): boolean => {
		if (!ts.isVariableStatement(node)) {
			return false;
		}

		const requireDeclaration = node.declarationList?.declarations[0]?.initializer as ts.Node;

		if (!requireDeclaration) {
			return false;
		}

		// check this: const SomeModule = require('path/SomeModule');
		if (ts.isCallExpression(requireDeclaration)) {
			return (requireDeclaration.expression as ts.Identifier).escapedText === 'require';
		}

		// check this: const SomeModule = require('path/SomeModule').default;
		if (ts.isPropertyAccessExpression(requireDeclaration)) {
			return ((requireDeclaration.expression as ts.CallExpression)?.expression as ts.Identifier)?.escapedText === 'require'
		}

		return false;
	}

	const replaceRequire = (node: ts.Node, context: ts.TransformationContext): ts.Node => {

		if (!ts.isVariableStatement(node)) {
			return node;
		}

		const requireDeclaration = node.declarationList?.declarations[0];
		const name = requireDeclaration.name.getText();

		let moduleImportFromPath;
		const requireInitializer = requireDeclaration?.initializer;

		if (ts.isCallExpression(requireInitializer as ts.Node)) {
			moduleImportFromPath = (requireInitializer as ts.CallExpression).arguments[0];
		} else if (ts.isPropertyAccessExpression(requireInitializer as ts.Node)) {
			moduleImportFromPath = ((requireInitializer as ts.PropertyAccessExpression).expression as ts.CallExpression).arguments[0]
		} else {
			return node;
		}


		return context.factory.createImportDeclaration(
    /* modifiers */ undefined,
			context.factory.createImportClause(
				false,
				context.factory.createIdentifier(name),
				undefined),
			moduleImportFromPath
		);
	}

	const checkRequireInlineWithDefault = (node: ts.Node): boolean => {
		// check this: require('path/SomeModule')
		if (ts.isCallExpression(node)) {
			return (node.expression as ts.Identifier).escapedText === 'require';
		}

		// check this: require('path/SomeModule').default
		if (ts.isPropertyAccessExpression(node)) {
			return ((node.expression as ts.CallExpression)?.expression as ts.Identifier)?.escapedText === 'require'
				&& (node.name as ts.Identifier)?.text === 'default';
		}

		return false;
	}

	const replaceRequireInlineWithDefault = (
		node: ts.Node,
		context: ts.TransformationContext,
		imports: ts.ImportDeclaration[]
	): ts.Node => {

		const nodeLocal = ts.isPropertyAccessExpression(node) ? node.expression : node;

		if (!ts.isCallExpression(nodeLocal)) {
			return nodeLocal;
		}

		const modulePath = (nodeLocal.arguments[0] as ts.StringLiteral).text;

		const lastPartOfModulePath = modulePath.split('/')
			.filter(part => part !== '@mycompanynamespace' && part !== 'dist' && part !== '.' && part !== '..')
			.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');

		let defaultImportName = lastPartOfModulePath
			.replace(':', '')
			.replace(/[-.-@_:](\w)|--(\w)/g, function (match, p1, p2) {
				return (p1 || p2).toUpperCase();
			}).replace(/^(\w)/, function (match, p1) {
				return p1.toUpperCase();
			});

		const importsDeclaration = context.factory.createImportDeclaration(
    /* modifiers */ undefined,
			context.factory.createImportClause(
				false,
				context.factory.createIdentifier(defaultImportName),
				undefined),
			context.factory.createStringLiteral(modulePath, true)
		);

		// ts.factory.updateSourceFile(node.getSourceFile(), [improtDeclaration, ...node.getSourceFile().statements])

		imports.push(importsDeclaration);

		return context.factory.createIdentifier(defaultImportName);
	}

	const checkRequirePolyfills = (node: ts.Node): boolean => {
		if (!ts.isExpressionStatement(node)) {
			return false;
		}

		const requireDeclaration = node.expression as ts.Node;

		if (!requireDeclaration) {
			return false;
		}

		if (ts.isCallExpression(requireDeclaration)) {
			return (requireDeclaration.expression as ts.Identifier).escapedText === 'require';
		}

		return false;
	}

	const replaceRequirePolyfills = (node: ts.Node, context: ts.TransformationContext): ts.Node => {
		if (!ts.isExpressionStatement(node)) {
			return node;
		}

		const requireDeclaration = node.expression;

		let moduleImportFromPath;

		if (ts.isCallExpression(requireDeclaration as ts.Node)) {
			moduleImportFromPath = (requireDeclaration as ts.CallExpression).arguments[0];
		} else {
			return node;
		}

		// ex: replace with empty string such require('../../_polyfills/Date.ISO9075')
		return context.factory.createImportDeclaration(
    /* modifiers */ undefined,
			undefined,
			moduleImportFromPath
		);
	}

	const imports: ts.ImportDeclaration[] = [];

	const RequireToImportTransformerFactory: ts.TransformerFactory<ts.SourceFile> = context => {
		return (sourceFile) => {
			const visitor = (node: ts.Node): ts.Node => {
				if (checkRequirePolyfills(node)) {
					return replaceRequirePolyfills(node, context)
				} else if (checkRequire(node)) {
					return replaceRequire(node, context);
				} else if (checkRequireInlineWithDefault(node)) {
					return replaceRequireInlineWithDefault(node, context, imports);
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

	/**
	 * Idling transformation need to reveal default ts transformations
	 * @param context 
	 * @returns 
	 */
	const IdlingTransformerFactory: ts.TransformerFactory<ts.SourceFile> = context => {
		return (sourceFile) => {
			const visitor = (node: ts.Node): ts.Node => {
				return ts.visitEachChild(node, visitor, context);
			};

			return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
		};
	};

	let headerComments = '';

	const ImportsTransformerFactory: ts.TransformerFactory<ts.SourceFile> = context => {
		return (sourceFile) => {

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

			if (imports.length) {
				allStatements = originalStatements.length > 1 ? [
					headerStatement, // lets put header first, it may have original comment
					...imports,
					...originalStatements.slice(1)
				] : [
					...imports,
					...originalStatements
				];

				if (hasDuplicates(allStatements)) {
					throw new Error(`Imports declaration collision in the file: [${sourceFile.fileName}]`)
				}

				return context.factory.updateSourceFile(sourceFile.getSourceFile(), allStatements);
			}

			return sourceFile;
		};
	};

	const transformationResult = ts.transform(
		sourceFile,
		idling ? [IdlingTransformerFactory] :
			[
				RequireToImportTransformerFactory,
				// LoggingTransformerFactory,
				ImportsTransformerFactory
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
const idling: boolean = process.argv[3] === '--idling'

const filesToFormat: string[] = [];

fsVisitor(dirPath, (filePath) => {
	// transformation
	const transformedSourceFile = transformRequireToImport(filePath, idling);

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


