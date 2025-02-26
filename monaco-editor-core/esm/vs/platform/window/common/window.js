import { isMacintosh, isWeb } from '../../../base/common/platform.js';
export function getTitleBarStyle(configurationService) {
    if (isWeb) {
        return "custom" /* TitlebarStyle.CUSTOM */;
    }
    const configuration = configurationService.getValue('window');
    if (configuration) {
        const useNativeTabs = isMacintosh && configuration.nativeTabs === true;
        if (useNativeTabs) {
            return "native" /* TitlebarStyle.NATIVE */; // native tabs on sierra do not work with custom title style
        }
        const useSimpleFullScreen = isMacintosh && configuration.nativeFullScreen === false;
        if (useSimpleFullScreen) {
            return "native" /* TitlebarStyle.NATIVE */; // simple fullscreen does not work well with custom title style (https://github.com/microsoft/vscode/issues/63291)
        }
        const style = configuration.titleBarStyle;
        if (style === "native" /* TitlebarStyle.NATIVE */ || style === "custom" /* TitlebarStyle.CUSTOM */) {
            return style;
        }
    }
    return "custom" /* TitlebarStyle.CUSTOM */; // default to custom on all OS
}
