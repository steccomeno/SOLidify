module.exports = {
    webpack: {
        configure: {
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
                    module: /node_modules\/@project-serum/,
                },
                {
                    module: /node_modules\/@solana\/web3.js/,
                },
                {
                    module: /node_modules\/@solana\/buffer-layout/,
                },
                {
                    module: /node_modules\/@solana\/web3.js\/node_modules\/superstruct/,
                },
                {
                    message: /Failed to parse source map/,
                }
            ],
            devtool: false
        }
    }
}; 