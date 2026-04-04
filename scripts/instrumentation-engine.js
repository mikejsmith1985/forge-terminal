const recast = require('recast');
const builders = recast.types.builders;
const namedTypes = recast.types.namedTypes;

class InstrumentationEngine {
    process(code) {
        const ast = recast.parse(code);
        
        recast.visit(ast, {
            visitFunction: function(path) {
                const node = path.node;
                const name = node.id ? node.id.name : 'anonymous';
                
                // Capture arguments (only simple identifiers for now)
                const argValues = node.params
                    .filter(p => namedTypes.Identifier.check(p))
                    .map(p => builders.identifier(p.name));

                // Prepare probe data
                const probeData = builders.objectExpression([
                    builders.property('init', builders.identifier('type'), builders.literal('ENTRY')),
                    builders.property('init', builders.identifier('name'), builders.literal(name)),
                    builders.property('init', builders.identifier('args'), builders.arrayExpression(argValues))
                ]);

                // Create log statement: console.log("[FORGE_PROBE]", JSON.stringify({...}))
                const logStmt = builders.expressionStatement(
                    builders.callExpression(
                        builders.memberExpression(builders.identifier('console'), builders.identifier('log')),
                        [
                            builders.literal('[FORGE_PROBE]'),
                            builders.callExpression(
                                builders.memberExpression(builders.identifier('JSON'), builders.identifier('stringify')),
                                [probeData]
                            )
                        ]
                    )
                );

                // Handle Arrow Functions with implicit return
                if (!namedTypes.BlockStatement.check(node.body)) {
                    node.body = builders.blockStatement([
                        builders.returnStatement(node.body)
                    ]);
                }

                // Inject at start of body
                node.body.body.unshift(logStmt);
                
                this.traverse(path);
            },

            visitReturnStatement: function(path) {
                const node = path.node;
                
                // Case 1: Return with value
                if (node.argument) {
                    const tempVar = builders.identifier('__forge_ret');
                    
                    // const __forge_ret = <expr>;
                    const decl = builders.variableDeclaration('const', [
                        builders.variableDeclarator(tempVar, node.argument)
                    ]);
                    
                    const probeData = builders.objectExpression([
                        builders.property('init', builders.identifier('type'), builders.literal('RETURN')),
                        builders.property('init', builders.identifier('value'), tempVar)
                    ]);
                    
                    const logStmt = builders.expressionStatement(
                        builders.callExpression(
                            builders.memberExpression(builders.identifier('console'), builders.identifier('log')),
                            [
                                builders.literal('[FORGE_PROBE]'),
                                builders.callExpression(
                                    builders.memberExpression(builders.identifier('JSON'), builders.identifier('stringify')),
                                    [probeData]
                                )
                            ]
                        )
                    );
                    
                    const newReturn = builders.returnStatement(tempVar);
                    
                    // Replace with block: { decl; log; return; }
                    const block = builders.blockStatement([decl, logStmt, newReturn]);
                    path.replace(block);
                } 
                // Case 2: Return without value
                else {
                    const probeData = builders.objectExpression([
                        builders.property('init', builders.identifier('type'), builders.literal('RETURN')),
                        builders.property('init', builders.identifier('value'), builders.identifier('undefined'))
                    ]);
                    
                    const logStmt = builders.expressionStatement(
                        builders.callExpression(
                            builders.memberExpression(builders.identifier('console'), builders.identifier('log')),
                            [
                                builders.literal('[FORGE_PROBE]'),
                                builders.callExpression(
                                    builders.memberExpression(builders.identifier('JSON'), builders.identifier('stringify')),
                                    [probeData]
                                )
                            ]
                        )
                    );
                    
                    // For void return, just insert log before. 
                    // To be safe against "if(x) return;" -> "if(x) log; return;", we wrap in block too.
                    const block = builders.blockStatement([logStmt, node]);
                    path.replace(block);
                }

                return false; // Don't traverse into the new nodes we just created
            },

            visitIfStatement: function(path) {
                const node = path.node;

                // Ensure consequent is a block
                if (!namedTypes.BlockStatement.check(node.consequent)) {
                    node.consequent = builders.blockStatement([node.consequent]);
                }

                // Ensure alternate is a block (if exists)
                if (node.alternate && !namedTypes.BlockStatement.check(node.alternate)) {
                    // Handle 'else if' carefully - if alternate is IfStatement, don't wrap in block unless we want to recurse?
                    // Standard pattern: if (...) {} else { if (...) {} }
                    // But 'else if' is usually cleaner without block if it's just another If.
                    // However, we want to probe the branch.
                    if (node.alternate.type !== 'IfStatement') {
                        node.alternate = builders.blockStatement([node.alternate]);
                    }
                }

                // Inject probe into consequent
                const probeData = builders.objectExpression([
                    builders.property('init', builders.identifier('type'), builders.literal('BRANCH')),
                    builders.property('init', builders.identifier('location'), builders.literal('if-consequent'))
                ]);
                
                const logStmt = builders.expressionStatement(
                    builders.callExpression(
                        builders.memberExpression(builders.identifier('console'), builders.identifier('log')),
                        [
                            builders.literal('[FORGE_PROBE]'),
                            builders.callExpression(
                                builders.memberExpression(builders.identifier('JSON'), builders.identifier('stringify')),
                                [probeData]
                            )
                        ]
                    )
                );

                node.consequent.body.unshift(logStmt);

                // Inject probe into alternate if it is a block
                if (node.alternate && namedTypes.BlockStatement.check(node.alternate)) {
                     const altProbeData = builders.objectExpression([
                        builders.property('init', builders.identifier('type'), builders.literal('BRANCH')),
                        builders.property('init', builders.identifier('location'), builders.literal('if-alternate'))
                    ]);
                    
                    const altLogStmt = builders.expressionStatement(
                        builders.callExpression(
                            builders.memberExpression(builders.identifier('console'), builders.identifier('log')),
                            [
                                builders.literal('[FORGE_PROBE]'),
                                builders.callExpression(
                                    builders.memberExpression(builders.identifier('JSON'), builders.identifier('stringify')),
                                    [altProbeData]
                                )
                            ]
                        )
                    );
                    
                    node.alternate.body.unshift(altLogStmt);
                }

                this.traverse(path);
            }
        });

        return recast.print(ast).code;
    }

    removeProbes(code) {
        const ast = recast.parse(code);
        const self = this;

        // Helper to identify probe logs
        function isProbeLog(node) {
            return namedTypes.ExpressionStatement.check(node) &&
                   namedTypes.CallExpression.check(node.expression) &&
                   namedTypes.MemberExpression.check(node.expression.callee) &&
                   namedTypes.Identifier.check(node.expression.callee.object) &&
                   node.expression.callee.object.name === 'console' &&
                   namedTypes.Identifier.check(node.expression.callee.property) &&
                   node.expression.callee.property.name === 'log' &&
                   node.expression.arguments.length > 0 &&
                   namedTypes.Literal.check(node.expression.arguments[0]) &&
                   node.expression.arguments[0].value === '[FORGE_PROBE]';
        }

        recast.visit(ast, {
            visitBlockStatement: function(path) {
                const node = path.node;
                const newBody = [];
                
                for (let i = 0; i < node.body.length; i++) {
                    const stmt = node.body[i];

                    // 1. Remove Probe Logs
                    if (isProbeLog(stmt)) {
                        continue;
                    }

                    // 2. Handle Return Capture Reversion
                    // Pattern: const __forge_ret = ...; (optional logs); return __forge_ret;
                    if (namedTypes.VariableDeclaration.check(stmt) &&
                        stmt.declarations.length === 1 &&
                        namedTypes.Identifier.check(stmt.declarations[0].id) &&
                        stmt.declarations[0].id.name === '__forge_ret') {
                        
                        const init = stmt.declarations[0].init;
                        
                        // Look ahead
                        let j = i + 1;
                        let foundReturn = null;
                        let validPattern = true;

                        while (j < node.body.length) {
                            const next = node.body[j];
                            
                            // Found the return?
                            if (namedTypes.ReturnStatement.check(next) &&
                                namedTypes.Identifier.check(next.argument) &&
                                next.argument.name === '__forge_ret') {
                                foundReturn = next;
                                break;
                            }
                            
                            // If not return, MUST be a probe log to be skipped
                            if (!isProbeLog(next)) {
                                validPattern = false;
                                break;
                            }
                            
                            j++;
                        }

                        if (validPattern && foundReturn) {
                            // Restore original return
                            newBody.push(builders.returnStatement(init));
                            i = j; // Advance past the return
                            continue;
                        }
                    }

                    newBody.push(stmt);
                }

                node.body = newBody;
                this.traverse(path);
            }
        });

        return recast.print(ast).code;
    }
}

module.exports = InstrumentationEngine;
