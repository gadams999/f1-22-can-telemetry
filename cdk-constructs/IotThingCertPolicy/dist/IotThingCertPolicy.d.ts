import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
export interface Mapping {
    [keys: string]: string;
}
/**
 * @summary The properties for the IotThingCertPolicy class.
 */
export interface IotThingCertPolicyProps {
    /**
     * Name of AWS IoT thing to create.
     *
     * @default - None
     */
    thingName: string;
    /**
     * Name of the AWS IoT Core policy to create.
     *
     * @default - None
     */
    iotPolicyName: string;
    /**
     * The AWS IoT policy to be created and attached to the certificate.
     * JSON string converted to IoT policy, lodash format for replacement.
     *
     * @default - None
     */
    iotPolicy: string;
    /**
     * An object of parameters and values to be replaced if a Jinja template is
     * provided. For each matching parameter in the policy template, the value
     * will be used. If not provided, only the `<% thingname %>` mapping will be available for the `iotPolicy` template.
     *
     * @default - None
     */
    policyParameterMapping?: Mapping;
    /**
     * Selects RSA or ECC private key and certificate generation. If not provided, `RSA` will be used.
     *
     * @default - RSA
     */
    encryptionAlgorithm?: string;
}
/**
 * This construct creates an AWS IoT thing, IoT certificate, and IoT policy.
 * It attaches the certificate to the thing and policy, and stores the
 * certificate private key into an AWS Systems Manager Parameter Store
 * string for reference outside of the CloudFormation stack.
 *
 * Use this construct to create and delete a thing, principal, and policy for
 * testing or other singular uses.
 *
 * @summary Creates and associates an AWS IoT thing, certificate and policy.
 *
 */
/**
 * @ summary The IotThingCertPolicy class.
 */
export declare class IotThingCertPolicy extends Construct {
    readonly thingArn: string;
    readonly iotPolicyArn: string;
    readonly certificateArn: string;
    readonly certificatePemParameter: string;
    readonly privateKeySecretParameter: string;
    readonly dataAtsEndpointAddress: string;
    readonly credentialProviderEndpointAddress: string;
    private customResourceName;
    /**
     * @summary Constructs a new instance of the IotThingCertPolicy class.
     * @param {cdp.App} scope - represents the scope for all the resources.
     * @param {string} id - this is a scope-unique id.
     * @param {IotThingCertPolicyProps} props - user provided props for the construct.
     * @since 1.114.0
     */
    constructor(scope: Construct, id: string, props: IotThingCertPolicyProps);
    static getOrCreateProvider: (scope: Construct, resourceName: string) => cr.Provider;
}
//# sourceMappingURL=IotThingCertPolicy.d.ts.map