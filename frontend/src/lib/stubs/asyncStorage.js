/**
 * Browser shim for optional React Native AsyncStorage peer deps (MetaMask SDK / WalletConnect).
 */
const storage =
  typeof window !== "undefined"
    ? window.localStorage
    : {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      };

const AsyncStorage = {
  getItem: async (key) => storage.getItem(key),
  setItem: async (key, value) => {
    storage.setItem(key, value);
  },
  removeItem: async (key) => {
    storage.removeItem(key);
  },
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
