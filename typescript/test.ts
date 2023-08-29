import * as ts from "typescript";

const filename = "test.ts";
const code = `
const test2: string = '5555';

const test: number = 1 + 2;

/* dfdfd */
// test comment
/* 1111 */
const test3: string = '4444;
`;

const sourceFile = ts.createSourceFile(
	filename, code, ts.ScriptTarget.Latest
);

const transformerFactory: ts.TransformerFactory<ts.Node> = (
	context: ts.TransformationContext
) => {
	return (rootNode) => {
		function visit(node: ts.Node): ts.Node {
			node = ts.visitEachChild(node, visit, context);

			const existingComments = ts.getLeadingCommentRanges(rootNode.getFullText(), node.pos)

			if (existingComments) {
				for (const comment of existingComments) {
					console.log('Comment:')
					console.log(rootNode.getFullText().substring(comment.pos, comment.end))
				}
				ts.addSyntheticTrailingComment(
					node,
					ts.SyntaxKind.SingleLineCommentTrivia,
					'test comment 2',
					true
				);
			}

			if (ts.isIdentifier(node)) {
				// starting from TS 4.0
				return context.factory.createIdentifier(node.text + "suffix");
			} else {
				return node;
			}
		}

		return ts.visitNode(rootNode, visit);
	};
};

const transformationResult = ts.transform(
	sourceFile, [transformerFactory]
);

const transformedSourceFile = transformationResult.transformed[0];
const printer = ts.createPrinter();

const result = printer.printNode(
	ts.EmitHint.SourceFile,
	transformedSourceFile,
	transformedSourceFile as ts.SourceFile,
);

//console.log(result); // const testsuffix: number = 1 + 2;