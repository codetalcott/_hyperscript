///=========================================================================
/// This module provides the MCP (Model Context Protocol) client feature for hyperscript
///=========================================================================

'use strict';

(function (self, factory) {
    const plugin = factory(self)

    if (typeof exports === 'object' && typeof exports['nodeName'] !== 'string') {
        module.exports = plugin
    } else {
        if ('_hyperscript' in self) self._hyperscript.use(plugin)
    }
})(typeof self !== 'undefined' ? self : this, self => {

    return (_hyperscript) => {
        var invocationIdCounter = 0;

        function parseUrl(url) {
            var finalUrl = url;
            if (finalUrl.indexOf("/") === 0) {
                var basePart = window.location.hostname + (window.location.port ? ':' + window.location.port : '');
                if (window.location.protocol === 'https:') {
                    finalUrl = "wss://" + basePart + finalUrl;
                } else if (window.location.protocol === 'http:') {
                    finalUrl = "ws://" + basePart + finalUrl;
                }
            }
            return finalUrl;
        }

        function createMCPConnection(url) {
            var parsedUrl = parseUrl(url.evaluate());
            return new WebSocket(parsedUrl);
        }

        _hyperscript.addFeature("mcp", function (parser, runtime, tokens) {
            if (tokens.matchToken("mcp")) {
                // Parse the MCP client name
                var name = parser.requireElement("dotOrColonPath", tokens);
                var qualifiedName = name.evaluate();
                var nameSpace = qualifiedName.split(".");
                var mcpName = nameSpace.pop();

                var promises = {};
                var tools = {};
                var resources = {};
                
                // Parse the connection URL
                tokens.requireToken("from");
                var url = parser.requireElement("stringLike", tokens);

                // Parse optional configuration
                var config = {
                    timeout: 30000,
                    reconnect: true,
                    reconnectDelay: 1000
                };

                if (tokens.matchToken("with")) {
                    do {
                        if (tokens.matchToken("timeout")) {
                            config.timeout = parser.requireElement("expression", tokens).evaluate();
                        } else if (tokens.matchToken("no")) {
                            tokens.requireToken("reconnect");
                            config.reconnect = false;
                        }
                    } while (tokens.matchToken("and"));
                }

                // Parse event handlers
                var handlers = {};
                while (tokens.matchToken("on")) {
                    var eventType = tokens.requireTokenType("IDENTIFIER").value;
                    
                    if (tokens.matchToken("as")) {
                        var varName = tokens.requireTokenType("IDENTIFIER").value;
                    }
                    
                    var handler = parser.requireElement("commandList", tokens);
                    var implicitReturn = {
                        type: "implicitReturn",
                        op: function (context) {
                            return runtime.HALT;
                        },
                        execute: function (context) {
                            // do nothing
                        },
                    };
                    var end = handler;
                    while (end.next) {
                        end = end.next;
                    }
                    end.next = implicitReturn;
                    
                    handlers[eventType] = { handler: handler, varName: varName };
                }

                tokens.requireToken("end");

                // Create the MCP connection
                var socket = null;
                var isConnected = false;
                var reconnectTimer = null;

                function connect() {
                    socket = createMCPConnection(url);
                    
                    socket.onopen = function() {
                        isConnected = true;
                        
                        // Send initialization request
                        var initRequest = {
                            jsonrpc: "2.0",
                            method: "initialize",
                            params: {
                                protocolVersion: "2024-11-05",
                                capabilities: {
                                    roots: {
                                        listChanged: true
                                    },
                                    sampling: {}
                                },
                                clientInfo: {
                                    name: "hyperscript-mcp-client",
                                    version: "0.1.0"
                                }
                            },
                            id: invocationIdCounter++
                        };
                        socket.send(JSON.stringify(initRequest));
                        
                        // Execute connect handler if exists
                        if (handlers.connect) {
                            var context = runtime.makeContext(mcpObject, mcpFeature, mcpObject);
                            handlers.connect.handler.execute(context);
                        }
                    };

                    socket.onmessage = function(evt) {
                        try {
                            var message = JSON.parse(evt.data);
                            
                            // Handle responses to our requests
                            if (message.id !== undefined && promises[message.id]) {
                                if (message.error) {
                                    promises[message.id].reject(message.error);
                                } else {
                                    promises[message.id].resolve(message.result);
                                    
                                    // Special handling for initialization response
                                    if (message.result && message.result.capabilities) {
                                        // Store available tools
                                        if (message.result.capabilities.tools) {
                                            // Request tool list
                                            listTools();
                                        }
                                        
                                        // Store available resources
                                        if (message.result.capabilities.resources) {
                                            // Request resource list
                                            listResources();
                                        }
                                    }
                                }
                                delete promises[message.id];
                            }
                            
                            // Handle notifications
                            if (message.method && !message.id) {
                                var handler = handlers[message.method];
                                if (handler) {
                                    var context = runtime.makeContext(mcpObject, mcpFeature, mcpObject);
                                    if (handler.varName) {
                                        context.locals[handler.varName] = message.params;
                                    }
                                    context.result = message.params;
                                    handler.handler.execute(context);
                                }
                            }
                        } catch (e) {
                            console.error("Error parsing MCP message:", e);
                        }
                    };

                    socket.onerror = function(err) {
                        if (handlers.error) {
                            var context = runtime.makeContext(mcpObject, mcpFeature, mcpObject);
                            context.locals.error = err;
                            handlers.error.handler.execute(context);
                        }
                    };

                    socket.onclose = function() {
                        isConnected = false;
                        socket = null;
                        
                        if (handlers.disconnect) {
                            var context = runtime.makeContext(mcpObject, mcpFeature, mcpObject);
                            handlers.disconnect.handler.execute(context);
                        }
                        
                        // Attempt reconnection if configured
                        if (config.reconnect && !reconnectTimer) {
                            reconnectTimer = setTimeout(function() {
                                reconnectTimer = null;
                                connect();
                            }, config.reconnectDelay);
                        }
                    };
                }

                function sendRequest(method, params) {
                    return new Promise(function(resolve, reject) {
                        if (!isConnected) {
                            reject(new Error("MCP client not connected"));
                            return;
                        }
                        
                        var id = invocationIdCounter++;
                        var request = {
                            jsonrpc: "2.0",
                            method: method,
                            params: params || {},
                            id: id
                        };
                        
                        promises[id] = { resolve: resolve, reject: reject };
                        socket.send(JSON.stringify(request));
                        
                        // Set timeout
                        setTimeout(function() {
                            if (promises[id]) {
                                promises[id].reject(new Error("Request timed out"));
                                delete promises[id];
                            }
                        }, config.timeout);
                    });
                }

                function listTools() {
                    sendRequest("tools/list").then(function(result) {
                        if (result && result.tools) {
                            result.tools.forEach(function(tool) {
                                tools[tool.name] = tool;
                            });
                        }
                    });
                }

                function listResources() {
                    sendRequest("resources/list").then(function(result) {
                        if (result && result.resources) {
                            resources = result.resources;
                        }
                    });
                }

                // Create the MCP client object
                var mcpObject = {
                    isConnected: function() { return isConnected; },
                    
                    // Direct method calls
                    call: function(toolName, args) {
                        if (!tools[toolName]) {
                            return Promise.reject(new Error("Unknown tool: " + toolName));
                        }
                        return sendRequest("tools/call", {
                            name: toolName,
                            arguments: args || {}
                        });
                    },
                    
                    // Resource access
                    readResource: function(uri) {
                        return sendRequest("resources/read", { uri: uri });
                    },
                    
                    // List available tools and resources
                    listTools: function() {
                        return sendRequest("tools/list");
                    },
                    
                    listResources: function() {
                        return sendRequest("resources/list");
                    },
                    
                    // Sampling (AI completion)
                    createMessage: function(messages, options) {
                        return sendRequest("sampling/createMessage", {
                            messages: messages,
                            maxTokens: options?.maxTokens || 1000,
                            temperature: options?.temperature,
                            stopSequences: options?.stopSequences,
                            modelPreferences: options?.modelPreferences
                        });
                    },
                    
                    // Manual connection control
                    connect: connect,
                    disconnect: function() {
                        config.reconnect = false;
                        if (reconnectTimer) {
                            clearTimeout(reconnectTimer);
                            reconnectTimer = null;
                        }
                        if (socket) {
                            socket.close();
                        }
                    }
                };

                // Create a proxy to allow dynamic tool calling
                var mcpProxy = new Proxy(mcpObject, {
                    get: function(target, prop) {
                        if (prop in target) {
                            return target[prop];
                        }
                        
                        // Check if it's a known tool
                        if (tools[prop]) {
                            return function(args) {
                                return target.call(prop, args);
                            };
                        }
                        
                        return undefined;
                    }
                });

                var mcpFeature = {
                    name: mcpName,
                    client: mcpProxy,
                    install: function(target) {
                        runtime.assignToNamespace(target, nameSpace, mcpName, mcpProxy);
                    }
                };

                // Start connection
                connect();

                return mcpFeature;
            }
        });
    }
})