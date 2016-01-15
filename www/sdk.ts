/// <reference path="../typings/codePush.d.ts" />
/// <reference path="../typings/fileTransfer.d.ts" />
/// <reference path="../typings/device.d.ts" />

"use strict";

import NativeAppInfo = require("./nativeAppInfo");
import HttpRequester = require("./httpRequester");

/**
 * Interacts with the CodePush Acquisition SDK.
 */
class Sdk {

    private static DefaultAcquisitionManager: AcquisitionManager;
    private static DefaultConfiguration: Configuration;
    
    /**
     * Reads the CodePush configuration and creates an AcquisitionManager instance using it.
     */
    public static getAcquisitionManager(callback: Callback<AcquisitionManager>, userDeploymentKey?: string): void {

        var resolveManager = (defaultInstance: AcquisitionManager): void => {
            if (userDeploymentKey) {
                var customConfiguration: Configuration = {
                    deploymentKey: userDeploymentKey,
                    serverUrl: Sdk.DefaultConfiguration.serverUrl,
                    ignoreAppVersion: Sdk.DefaultConfiguration.ignoreAppVersion,
                    appVersion: Sdk.DefaultConfiguration.appVersion,
                    clientUniqueId: Sdk.DefaultConfiguration.clientUniqueId
                };
                var customAcquisitionManager: AcquisitionManager = new AcquisitionManager(new HttpRequester(), customConfiguration);
                callback(null, customAcquisitionManager);
            } else {
                callback(null, Sdk.DefaultAcquisitionManager);
            }
        };

        if (Sdk.DefaultAcquisitionManager) {
            resolveManager(Sdk.DefaultAcquisitionManager);
        } else {
            NativeAppInfo.getServerURL((serverError: Error, serverURL: string) => {
                NativeAppInfo.getDeploymentKey((depolymentKeyError: Error, deploymentKey: string) => {
                    NativeAppInfo.getApplicationVersion((appVersionError: Error, appVersion: string) => {
                        if (!serverURL || !deploymentKey || !appVersion) {
                            callback(new Error("Could not get the CodePush configuration. Please check your config.xml file."), null);
                        } else {
                            Sdk.DefaultConfiguration = {
                                deploymentKey: deploymentKey,
                                serverUrl: serverURL,
                                ignoreAppVersion: false,
                                appVersion: appVersion,
                                clientUniqueId: device.uuid
                            };
                            Sdk.DefaultAcquisitionManager = new AcquisitionManager(new HttpRequester(), Sdk.DefaultConfiguration);
                            resolveManager(Sdk.DefaultAcquisitionManager);
                        }
                    });
                });
            });
        }
    }

    /**
     * Reports the update status to the CodePush server.
     */
    public static reportStatus(pkg?: IPackage, status?: string, callback?: Callback<void>) {
        try {
            Sdk.getAcquisitionManager((error: Error, acquisitionManager: AcquisitionManager) => {
                if (error) {
                    callback && callback(error, null);
                }
                else {
                    acquisitionManager.reportStatusDeploy(pkg, status, callback);
                }
            });
        } catch (e) {
            callback && callback(new Error("An error occured while reporting the status. " + e), null);
        }
    }
}

export = Sdk;