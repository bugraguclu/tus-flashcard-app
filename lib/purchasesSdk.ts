/**
 * The RevenueCat SDK, behind a platform split. The iPhone build uses the real SDK; the web build
 * resolves `purchasesSdk.web.ts` instead, which keeps RevenueCat's browser SDK out of the page.
 */
export { default, LOG_LEVEL } from 'react-native-purchases';
