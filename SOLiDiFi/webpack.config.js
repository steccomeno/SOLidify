const path = require('path');

module.exports = {
    resolve: {
        fallback: {
            "assert": require.resolve("assert/"),
            // Add other necessary fallbacks here if needed
        }
    },
    module: {
        rules: [
            {
                test: /\.m?js/,
                resolve: {
                    fullySpecified: false
                }
            }
        ]
    },
    ignoreWarnings: [
        {
            module: /node_modules\/@project-serum\/anchor/,
        },
        {
            module: /node_modules\/@coral-xyz\/borsh/,
        },
        {
            module: /node_modules\/@solana/,
        },
        {
            message: /Failed to parse source map/,
        }
    ]
};
