Use https://astexplorer.net/ to explose ASTs

## `require` -> `import` transformation

0. Run prettier formatting for folder:

```bash
pnpm exec ts-node typescript/format.ts modules/client
```

1. Commit changes

2. Run 'idling' transformation to reveal default ts transformations.
```bash
pnpm exec ts-node typescript/index.ts modules/client --idling
```

3. Run prettier formatting for folder:

```bash
pnpm exec ts-node typescript/format.ts modules/client
```

4. Commit changes.

5. Run (`require` -> `import`) transformation for folder with prettier formatting:

```bash
pnpm exec ts-node typescript/format.ts modules/client
```

6. Commit changes (remember this commit). TS compiler may have error.
So, to avoid loosing data, you can find it in this commit.
It also will help to separate actual transformations from default ts transformations.

7. Run transformation for folder with prettier formatting:

8. Run actual transformation with `--format`:
```bash
pnpm exec ts-node typescript/index.ts modules/client --format
```

9. Commit changes








## Primary entry point (pep) transformation

1. Run pep transformation with format:
```bash
pnpm exec ts-node typescript/pep.ts modules/ --format
```

NOTE: Command for testing:
```bash
pnpm exec ts-node typescript/pep.ts typescript/data/requiresInHeaderStub.tsx --format typescript/data/stub_node_modules
```
## Export-equals transformation
1. Run transfromation:
```bash
pnpm exec ts-node typescript/export-equals.ts modules/ --format
```
2. Discard export-equals changes in `modules/client/webpack-config-helpers` and `modules/common/common-eslint-config`
3. Revert `export=` for `modules/deployments/*/config-private/src/config-sequelize/index.ts`


