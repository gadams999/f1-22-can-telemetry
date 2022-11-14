"use strict";
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
Object.defineProperty(exports, "__esModule", { value: true });
exports.IotThingCertPolicy = void 0;
const _ = require("lodash");
const path = require("path");
const cdk = require("aws-cdk-lib");
const logs = require("aws-cdk-lib/aws-logs");
const iam = require("aws-cdk-lib/aws-iam");
const cr = require("aws-cdk-lib/custom-resources");
const lambda = require("aws-cdk-lib/aws-lambda");
const aws_lambda_python_alpha_1 = require("@aws-cdk/aws-lambda-python-alpha");
const constructs_1 = require("constructs");
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
class IotThingCertPolicy extends constructs_1.Construct {
    /**
     * @summary Constructs a new instance of the IotThingCertPolicy class.
     * @param {cdp.App} scope - represents the scope for all the resources.
     * @param {string} id - this is a scope-unique id.
     * @param {IotThingCertPolicyProps} props - user provided props for the construct.
     * @since 1.114.0
     */
    constructor(scope, id, props) {
        var _a, _b, _c, _d;
        super(scope, id);
        this.customResourceName = "IotThingCertPolicyFunction";
        const stackName = cdk.Stack.of(this).stackName;
        // Validate and derive final values for resources
        const encryptionAlgorithm = props.encryptionAlgorithm || "RSA";
        if (!["RSA", "ECC"].includes(encryptionAlgorithm)) {
            console.error("Invalid value for encryptionAlgorithm, use either 'RSA' or 'ECC'.");
            process.exitCode = 1;
        }
        // For the AWS Core policy, the template maps replacements from the
        // props.policyParameterMapping along with the following provided variables:
        // thingname  - used as: <% thingname %>
        let policyParameters = props.policyParameterMapping || {};
        policyParameters.thingname = props.thingName;
        // lodash that creates template then applies the mapping
        var policyTemplate = _.template(props.iotPolicy);
        var iotPolicy = policyTemplate(policyParameters);
        const provider = IotThingCertPolicy.getOrCreateProvider(this, this.customResourceName);
        const customResource = new cdk.CustomResource(this, this.customResourceName, {
            serviceToken: provider.serviceToken,
            properties: {
                StackName: stackName,
                ThingName: props.thingName,
                IotPolicy: iotPolicy,
                IoTPolicyName: props.iotPolicyName,
                EncryptionAlgorithm: encryptionAlgorithm,
            },
        });
        // Custom resource Lambda role permissions
        // Permissions to act on thing, certificate, and policy
        (_a = provider.onEventHandler.role) === null || _a === void 0 ? void 0 : _a.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: ["iot:CreateThing", "iot:DeleteThing"],
            resources: [
                `arn:${cdk.Fn.ref("AWS::Partition")}:iot:${cdk.Fn.ref("AWS::Region")}:${cdk.Fn.ref("AWS::AccountId")}:thing/${props.thingName}`,
            ],
        }));
        // Create and delete specific policy
        (_b = provider.onEventHandler.role) === null || _b === void 0 ? void 0 : _b.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                "iot:CreatePolicy",
                "iot:DeletePolicy",
                "iot:DeletePolicyVersion",
                "iot:ListPolicyVersions",
                "iot:ListTargetsForPolicy",
            ],
            resources: [
                `arn:${cdk.Fn.ref("AWS::Partition")}:iot:${cdk.Fn.ref("AWS::Region")}:${cdk.Fn.ref("AWS::AccountId")}:policy/${props.iotPolicyName}`,
            ],
        }));
        // Create SSM parameter
        (_c = provider.onEventHandler.role) === null || _c === void 0 ? void 0 : _c.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: ["ssm:DeleteParameters", "ssm:PutParameter"],
            resources: [
                `arn:${cdk.Fn.ref("AWS::Partition")}:ssm:${cdk.Fn.ref("AWS::Region")}:${cdk.Fn.ref("AWS::AccountId")}:parameter/${stackName}/${props.thingName}/private_key`,
                `arn:${cdk.Fn.ref("AWS::Partition")}:ssm:${cdk.Fn.ref("AWS::Region")}:${cdk.Fn.ref("AWS::AccountId")}:parameter/${stackName}/${props.thingName}/certificate_pem`,
            ],
        }));
        // Actions without resource types
        (_d = provider.onEventHandler.role) === null || _d === void 0 ? void 0 : _d.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                "iot:AttachPolicy",
                "iot:AttachThingPrincipal",
                "iot:CreateCertificateFromCsr",
                "iot:DeleteCertificate",
                "iot:DescribeEndpoint",
                "iot:DetachPolicy",
                "iot:DetachThingPrincipal",
                "iot:ListAttachedPolicies",
                "iot:ListPrincipalThings",
                "iot:ListThingPrincipals",
                "iot:UpdateCertificate",
            ],
            resources: ["*"],
        }));
        // class public values
        this.certificatePemParameter = customResource.getAttString("CertificatePemParameter");
        this.privateKeySecretParameter = customResource.getAttString("PrivateKeySecretParameter");
        this.thingArn = customResource.getAttString("ThingArn");
        this.iotPolicyArn = customResource.getAttString("IotPolicyArn");
        this.certificateArn = customResource.getAttString("CertificateArn");
        this.dataAtsEndpointAddress = customResource.getAttString("DataAtsEndpointAddress");
        this.credentialProviderEndpointAddress = customResource.getAttString("CredentialProviderEndpointAddress");
    }
}
exports.IotThingCertPolicy = IotThingCertPolicy;
// Separate static function to create or return singleton provider
IotThingCertPolicy.getOrCreateProvider = (scope, resourceName) => {
    const stack = cdk.Stack.of(scope);
    const uniqueId = resourceName;
    const existing = stack.node.tryFindChild(uniqueId);
    if (existing === undefined) {
        const createThingFn = new aws_lambda_python_alpha_1.PythonFunction(stack, `${uniqueId}-Provider`, {
            entry: path.join(__dirname, "..", "assets"),
            index: "thing_cert_policy.py",
            runtime: lambda.Runtime.PYTHON_3_8,
            timeout: cdk.Duration.minutes(1),
            logRetention: logs.RetentionDays.ONE_MONTH,
        });
        // Role permissions are handled by the main constructor
        // Create the provider that invokes the Lambda function
        const createThingProvider = new cr.Provider(stack, uniqueId, {
            onEventHandler: createThingFn,
            logRetention: logs.RetentionDays.ONE_DAY,
        });
        return createThingProvider;
    }
    else {
        // Second or additional call, use existing provider
        return existing;
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSW90VGhpbmdDZXJ0UG9saWN5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0lvdFRoaW5nQ2VydFBvbGljeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEscUVBQXFFO0FBQ3JFLGlDQUFpQzs7O0FBRWpDLDRCQUEyQjtBQUMzQiw2QkFBNEI7QUFDNUIsbUNBQWtDO0FBQ2xDLDZDQUE0QztBQUM1QywyQ0FBMEM7QUFDMUMsbURBQWtEO0FBQ2xELGlEQUFnRDtBQUNoRCw4RUFBaUU7QUFDakUsMkNBQXNDO0FBNkN0Qzs7Ozs7Ozs7Ozs7R0FXRztBQUVIOztHQUVHO0FBRUgsTUFBYSxrQkFBbUIsU0FBUSxzQkFBUztJQVUvQzs7Ozs7O09BTUc7SUFDSCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQThCOztRQUN0RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFBO1FBVlYsdUJBQWtCLEdBQUcsNEJBQTRCLENBQUE7UUFZdkQsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUyxDQUFBO1FBQzlDLGlEQUFpRDtRQUNqRCxNQUFNLG1CQUFtQixHQUFHLEtBQUssQ0FBQyxtQkFBbUIsSUFBSSxLQUFLLENBQUE7UUFDOUQsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFO1lBQ2pELE9BQU8sQ0FBQyxLQUFLLENBQ1gsbUVBQW1FLENBQ3BFLENBQUE7WUFDRCxPQUFPLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQTtTQUNyQjtRQUVELG1FQUFtRTtRQUNuRSw0RUFBNEU7UUFDNUUsd0NBQXdDO1FBQ3hDLElBQUksZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLHNCQUFzQixJQUFJLEVBQUUsQ0FBQTtRQUN6RCxnQkFBZ0IsQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQTtR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LEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUNqQyxNQUFNLFFBQVEsR0FBRyxZQUFZLENBQUE7SUFDN0IsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFnQixDQUFBO0lBRWpFLElBQUksUUFBUSxLQUFLLFNBQVMsRUFBRTtRQUMxQixNQUFNLGFBQWEsR0FBRyxJQUFJLHdDQUFjLENBQUMsS0FBSyxFQUFFLEdBQUcsUUFBUSxXQUFXLEVBQUU7WUFDdEUsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUM7WUFDM0MsS0FBSyxFQUFFLHNCQUFzQjtZQUM3QixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVO1lBQ2xDLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDaEMsWUFBWSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUztTQUMzQyxDQUFDLENBQUE7UUFDRix1REFBdUQ7UUFFdkQsdURBQXVEO1FBQ3ZELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUU7WUFDM0QsY0FBYyxFQUFFLGFBQWE7WUFDN0IsWUFBWSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTztTQUN6QyxDQUFDLENBQUE7UUFDRixPQUFPLG1CQUFtQixDQUFBO0tBQzNCO1NBQU07UUFDTCxtREFBbUQ7UUFDbkQsT0FBTyxRQUFRLENBQUE7S0FDaEI7QUFDSCxDQUFDLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgQW1hem9uLmNvbSwgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbi8vIFNQRFgtTGljZW5zZS1JZGVudGlmaWVyOiBNSVQtMFxuXG5pbXBvcnQgKiBhcyBfIGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCJcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sb2dzXCJcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiXG5pbXBvcnQgKiBhcyBjciBmcm9tIFwiYXdzLWNkay1saWIvY3VzdG9tLXJlc291cmNlc1wiXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIlxuaW1wb3J0IHsgUHl0aG9uRnVuY3Rpb24gfSBmcm9tIFwiQGF3cy1jZGsvYXdzLWxhbWJkYS1weXRob24tYWxwaGFcIlxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIlxuXG5leHBvcnQgaW50ZXJmYWNlIE1hcHBpbmcge1xuICBba2V5czogc3RyaW5nXTogc3RyaW5nXG59XG5cbi8qKlxuICogQHN1bW1hcnkgVGhlIHByb3BlcnRpZXMgZm9yIHRoZSBJb3RUaGluZ0NlcnRQb2xpY3kgY2xhc3MuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSW90VGhpbmdDZXJ0UG9saWN5UHJvcHMge1xuICAvKipcbiAgICogTmFtZSBvZiBBV1MgSW9UIHRoaW5nIHRvIGNyZWF0ZS5cbiAgICpcbiAgICogQGRlZmF1bHQgLSBOb25lXG4gICAqL1xuICB0aGluZ05hbWU6IHN0cmluZ1xuICAvKipcbiAgICogTmFtZSBvZiB0aGUgQVdTIElvVCBDb3JlIHBvbGljeSB0byBjcmVhdGUuXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gTm9uZVxuICAgKi9cbiAgaW90UG9saWN5TmFtZTogc3RyaW5nXG4gIC8qKlxuICAgKiBUaGUgQVdTIElvVCBwb2xpY3kgdG8gYmUgY3JlYXRlZCBhbmQgYXR0YWNoZWQgdG8gdGhlIGNlcnRpZmljYXRlLlxuICAgKiBKU09OIHN0cmluZyBjb252ZXJ0ZWQgdG8gSW9UIHBvbGljeSwgbG9kYXNoIGZvcm1hdCBmb3IgcmVwbGFjZW1lbnQuXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gTm9uZVxuICAgKi9cbiAgaW90UG9saWN5OiBzdHJpbmdcbiAgLyoqXG4gICAqIEFuIG9iamVjdCBvZiBwYXJhbWV0ZXJzIGFuZCB2YWx1ZXMgdG8gYmUgcmVwbGFjZWQgaWYgYSBKaW5qYSB0ZW1wbGF0ZSBpc1xuICAgKiBwcm92aWRlZC4gRm9yIGVhY2ggbWF0Y2hpbmcgcGFyYW1ldGVyIGluIHRoZSBwb2xpY3kgdGVtcGxhdGUsIHRoZSB2YWx1ZVxuICAgKiB3aWxsIGJlIHVzZWQuIElmIG5vdCBwcm92aWRlZCwgb25seSB0aGUgYDwlIHRoaW5nbmFtZSAlPmAgbWFwcGluZyB3aWxsIGJlIGF2YWlsYWJsZSBmb3IgdGhlIGBpb3RQb2xpY3lgIHRlbXBsYXRlLlxuICAgKlxuICAgKiBAZGVmYXVsdCAtIE5vbmVcbiAgICovXG4gIHBvbGljeVBhcmFtZXRlck1hcHBpbmc/OiBNYXBwaW5nXG4gIC8qKlxuICAgKiBTZWxlY3RzIFJTQSBvciBFQ0MgcHJpdmF0ZSBrZXkgYW5kIGNlcnRpZmljYXRlIGdlbmVyYXRpb24uIElmIG5vdCBwcm92aWRlZCwgYFJTQWAgd2lsbCBiZSB1c2VkLlxuICAgKlxuICAgKiBAZGVmYXVsdCAtIFJTQVxuICAgKi9cbiAgZW5jcnlwdGlvbkFsZ29yaXRobT86IHN0cmluZ1xufVxuXG4vKipcbiAqIFRoaXMgY29uc3RydWN0IGNyZWF0ZXMgYW4gQVdTIElvVCB0aGluZywgSW9UIGNlcnRpZmljYXRlLCBhbmQgSW9UIHBvbGljeS5cbiAqIEl0IGF0dGFjaGVzIHRoZSBjZXJ0aWZpY2F0ZSB0byB0aGUgdGhpbmcgYW5kIHBvbGljeSwgYW5kIHN0b3JlcyB0aGVcbiAqIGNlcnRpZmljYXRlIHByaXZhdGUga2V5IGludG8gYW4gQVdTIFN5c3RlbXMgTWFuYWdlciBQYXJhbWV0ZXIgU3RvcmVcbiAqIHN0cmluZyBmb3IgcmVmZXJlbmNlIG91dHNpZGUgb2YgdGhlIENsb3VkRm9ybWF0aW9uIHN0YWNrLlxuICpcbiAqIFVzZSB0aGlzIGNvbnN0cnVjdCB0byBjcmVhdGUgYW5kIGRlbGV0ZSBhIHRoaW5nLCBwcmluY2lwYWwsIGFuZCBwb2xpY3kgZm9yXG4gKiB0ZXN0aW5nIG9yIG90aGVyIHNpbmd1bGFyIHVzZXMuXG4gKlxuICogQHN1bW1hcnkgQ3JlYXRlcyBhbmQgYXNzb2NpYXRlcyBhbiBBV1MgSW9UIHRoaW5nLCBjZXJ0aWZpY2F0ZSBhbmQgcG9saWN5LlxuICpcbiAqL1xuXG4vKipcbiAqIEAgc3VtbWFyeSBUaGUgSW90VGhpbmdDZXJ0UG9saWN5IGNsYXNzLlxuICovXG5cbmV4cG9ydCBjbGFzcyBJb3RUaGluZ0NlcnRQb2xpY3kgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgdGhpbmdBcm46IHN0cmluZ1xuICBwdWJsaWMgcmVhZG9ubHkgaW90UG9saWN5QXJuOiBzdHJpbmdcbiAgcHVibGljIHJlYWRvbmx5IGNlcnRpZmljYXRlQXJuOiBzdHJpbmdcbiAgcHVibGljIHJlYWRvbmx5IGNlcnRpZmljYXRlUGVtUGFyYW1ldGVyOiBzdHJpbmdcbiAgcHVibGljIHJlYWRvbmx5IHByaXZhdGVLZXlTZWNyZXRQYXJhbWV0ZXI6IHN0cmluZ1xuICBwdWJsaWMgcmVhZG9ubHkgZGF0YUF0c0VuZHBvaW50QWRkcmVzczogc3RyaW5nXG4gIHB1YmxpYyByZWFkb25seSBjcmVkZW50aWFsUHJvdmlkZXJFbmRwb2ludEFkZHJlc3M6IHN0cmluZ1xuICBwcml2YXRlIGN1c3RvbVJlc291cmNlTmFtZSA9IFwiSW90VGhpbmdDZXJ0UG9saWN5RnVuY3Rpb25cIlxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBDb25zdHJ1Y3RzIGEgbmV3IGluc3RhbmNlIG9mIHRoZSBJb3RUaGluZ0NlcnRQb2xpY3kgY2xhc3MuXG4gICAqIEBwYXJhbSB7Y2RwLkFwcH0gc2NvcGUgLSByZXByZXNlbnRzIHRoZSBzY29wZSBmb3IgYWxsIHRoZSByZXNvdXJjZXMuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBpZCAtIHRoaXMgaXMgYSBzY29wZS11bmlxdWUgaWQuXG4gICAqIEBwYXJhbSB7SW90VGhpbmdDZXJ0UG9saWN5UHJvcHN9IHByb3BzIC0gdXNlciBwcm92aWRlZCBwcm9wcyBmb3IgdGhlIGNvbnN0cnVjdC5cbiAgICogQHNpbmNlIDEuMTE0LjBcbiAgICovXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBJb3RUaGluZ0NlcnRQb2xpY3lQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZClcblxuICAgIGNvbnN0IHN0YWNrTmFtZSA9IGNkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWVcbiAgICAvLyBWYWxpZGF0ZSBhbmQgZGVyaXZlIGZpbmFsIHZhbHVlcyBmb3IgcmVzb3VyY2VzXG4gICAgY29uc3QgZW5jcnlwdGlvbkFsZ29yaXRobSA9IHByb3BzLmVuY3J5cHRpb25BbGdvcml0aG0gfHwgXCJSU0FcIlxuICAgIGlmICghW1wiUlNBXCIsIFwiRUNDXCJdLmluY2x1ZGVzKGVuY3J5cHRpb25BbGdvcml0aG0pKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBcIkludmFsaWQgdmFsdWUgZm9yIGVuY3J5cHRpb25BbGdvcml0aG0sIHVzZSBlaXRoZXIgJ1JTQScgb3IgJ0VDQycuXCJcbiAgICAgIClcbiAgICAgIHByb2Nlc3MuZXhpdENvZGUgPSAxXG4gICAgfVxuXG4gICAgLy8gRm9yIHRoZSBBV1MgQ29yZSBwb2xpY3ksIHRoZSB0ZW1wbGF0ZSBtYXBzIHJlcGxhY2VtZW50cyBmcm9tIHRoZVxuICAgIC8vIHByb3BzLnBvbGljeVBhcmFtZXRlck1hcHBpbmcgYWxvbmcgd2l0aCB0aGUgZm9sbG93aW5nIHByb3ZpZGVkIHZhcmlhYmxlczpcbiAgICAvLyB0aGluZ25hbWUgIC0gdXNlZCBhczogPCUgdGhpbmduYW1lICU+XG4gICAgbGV0IHBvbGljeVBhcmFtZXRlcnMgPSBwcm9wcy5wb2xpY3lQYXJhbWV0ZXJNYXBwaW5nIHx8IHt9XG4gICAgcG9saWN5UGFyYW1ldGVycy50aGluZ25hbWUgPSBwcm9wcy50aGluZ05hbWVcblxuICAgIC8vIGxvZGFzaCB0aGF0IGNyZWF0ZXMgdGVtcGxhdGUgdGhlbiBhcHBsaWVzIHRoZSBtYXBwaW5nXG4gICAgdmFyIHBvbGljeVRlbXBsYXRlID0gXy50ZW1wbGF0ZShwcm9wcy5pb3RQb2xpY3kpXG4gICAgdmFyIGlvdFBvbGljeSA9IHBvbGljeVRlbXBsYXRlKHBvbGljeVBhcmFtZXRlcnMpXG5cbiAgICBjb25zdCBwcm92aWRlciA9IElvdFRoaW5nQ2VydFBvbGljeS5nZXRPckNyZWF0ZVByb3ZpZGVyKFxuICAgICAgdGhpcyxcbiAgICAgIHRoaXMuY3VzdG9tUmVzb3VyY2VOYW1lXG4gICAgKVxuICAgIGNvbnN0IGN1c3RvbVJlc291cmNlID0gbmV3IGNkay5DdXN0b21SZXNvdXJjZShcbiAgICAgIHRoaXMsXG4gICAgICB0aGlzLmN1c3RvbVJlc291cmNlTmFtZSxcbiAgICAgIHtcbiAgICAgICAgc2VydmljZVRva2VuOiBwcm92aWRlci5zZXJ2aWNlVG9rZW4sXG4gICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICBTdGFja05hbWU6IHN0YWNrTmFtZSxcbiAgICAgICAgICBUaGluZ05hbWU6IHByb3BzLnRoaW5nTmFtZSxcbiAgICAgICAgICBJb3RQb2xpY3k6IGlvdFBvbGljeSxcbiAgICAgICAgICBJb1RQb2xpY3lOYW1lOiBwcm9wcy5pb3RQb2xpY3lOYW1lLFxuICAgICAgICAgIEVuY3J5cHRpb25BbGdvcml0aG06IGVuY3J5cHRpb25BbGdvcml0aG0sXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8gQ3VzdG9tIHJlc291cmNlIExhbWJkYSByb2xlIHBlcm1pc3Npb25zXG4gICAgLy8gUGVybWlzc2lvbnMgdG8gYWN0IG9uIHRoaW5nLCBjZXJ0aWZpY2F0ZSwgYW5kIHBvbGljeVxuICAgIHByb3ZpZGVyLm9uRXZlbnRIYW5kbGVyLnJvbGU/LmFkZFRvUHJpbmNpcGFsUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXCJpb3Q6Q3JlYXRlVGhpbmdcIiwgXCJpb3Q6RGVsZXRlVGhpbmdcIl0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46JHtjZGsuRm4ucmVmKFwiQVdTOjpQYXJ0aXRpb25cIil9OmlvdDoke2Nkay5Gbi5yZWYoXG4gICAgICAgICAgICBcIkFXUzo6UmVnaW9uXCJcbiAgICAgICAgICApfToke2Nkay5Gbi5yZWYoXCJBV1M6OkFjY291bnRJZFwiKX06dGhpbmcvJHtwcm9wcy50aGluZ05hbWV9YCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKVxuXG4gICAgLy8gQ3JlYXRlIGFuZCBkZWxldGUgc3BlY2lmaWMgcG9saWN5XG4gICAgcHJvdmlkZXIub25FdmVudEhhbmRsZXIucm9sZT8uYWRkVG9QcmluY2lwYWxQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImlvdDpDcmVhdGVQb2xpY3lcIixcbiAgICAgICAgICBcImlvdDpEZWxldGVQb2xpY3lcIixcbiAgICAgICAgICBcImlvdDpEZWxldGVQb2xpY3lWZXJzaW9uXCIsXG4gICAgICAgICAgXCJpb3Q6TGlzdFBvbGljeVZlcnNpb25zXCIsXG4gICAgICAgICAgXCJpb3Q6TGlzdFRhcmdldHNGb3JQb2xpY3lcIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjoke2Nkay5Gbi5yZWYoXCJBV1M6OlBhcnRpdGlvblwiKX06aW90OiR7Y2RrLkZuLnJlZihcbiAgICAgICAgICAgIFwiQVdTOjpSZWdpb25cIlxuICAgICAgICAgICl9OiR7Y2RrLkZuLnJlZihcIkFXUzo6QWNjb3VudElkXCIpfTpwb2xpY3kvJHtwcm9wcy5pb3RQb2xpY3lOYW1lfWAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgIClcblxuICAgIC8vIENyZWF0ZSBTU00gcGFyYW1ldGVyXG4gICAgcHJvdmlkZXIub25FdmVudEhhbmRsZXIucm9sZT8uYWRkVG9QcmluY2lwYWxQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcInNzbTpEZWxldGVQYXJhbWV0ZXJzXCIsIFwic3NtOlB1dFBhcmFtZXRlclwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjoke2Nkay5Gbi5yZWYoXCJBV1M6OlBhcnRpdGlvblwiKX06c3NtOiR7Y2RrLkZuLnJlZihcbiAgICAgICAgICAgIFwiQVdTOjpSZWdpb25cIlxuICAgICAgICAgICl9OiR7Y2RrLkZuLnJlZihcIkFXUzo6QWNjb3VudElkXCIpfTpwYXJhbWV0ZXIvJHtzdGFja05hbWV9LyR7XG4gICAgICAgICAgICBwcm9wcy50aGluZ05hbWVcbiAgICAgICAgICB9L3ByaXZhdGVfa2V5YCxcbiAgICAgICAgICBgYXJuOiR7Y2RrLkZuLnJlZihcIkFXUzo6UGFydGl0aW9uXCIpfTpzc206JHtjZGsuRm4ucmVmKFxuICAgICAgICAgICAgXCJBV1M6OlJlZ2lvblwiXG4gICAgICAgICAgKX06JHtjZGsuRm4ucmVmKFwiQVdTOjpBY2NvdW50SWRcIil9OnBhcmFtZXRlci8ke3N0YWNrTmFtZX0vJHtcbiAgICAgICAgICAgIHByb3BzLnRoaW5nTmFtZVxuICAgICAgICAgIH0vY2VydGlmaWNhdGVfcGVtYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKVxuXG4gICAgLy8gQWN0aW9ucyB3aXRob3V0IHJlc291cmNlIHR5cGVzXG4gICAgcHJvdmlkZXIub25FdmVudEhhbmRsZXIucm9sZT8uYWRkVG9QcmluY2lwYWxQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImlvdDpBdHRhY2hQb2xpY3lcIixcbiAgICAgICAgICBcImlvdDpBdHRhY2hUaGluZ1ByaW5jaXBhbFwiLFxuICAgICAgICAgIFwiaW90OkNyZWF0ZUNlcnRpZmljYXRlRnJvbUNzclwiLFxuICAgICAgICAgIFwiaW90OkRlbGV0ZUNlcnRpZmljYXRlXCIsXG4gICAgICAgICAgXCJpb3Q6RGVzY3JpYmVFbmRwb2ludFwiLFxuICAgICAgICAgIFwiaW90OkRldGFjaFBvbGljeVwiLFxuICAgICAgICAgIFwiaW90OkRldGFjaFRoaW5nUHJpbmNpcGFsXCIsXG4gICAgICAgICAgXCJpb3Q6TGlzdEF0dGFjaGVkUG9saWNpZXNcIixcbiAgICAgICAgICBcImlvdDpMaXN0UHJpbmNpcGFsVGhpbmdzXCIsXG4gICAgICAgICAgXCJpb3Q6TGlzdFRoaW5nUHJpbmNpcGFsc1wiLFxuICAgICAgICAgIFwiaW90OlVwZGF0ZUNlcnRpZmljYXRlXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pXG4gICAgKVxuXG4gICAgLy8gY2xhc3MgcHVibGljIHZhbHVlc1xuICAgIHRoaXMuY2VydGlmaWNhdGVQZW1QYXJhbWV0ZXIgPSBjdXN0b21SZXNvdXJjZS5nZXRBdHRTdHJpbmcoXG4gICAgICBcIkNlcnRpZmljYXRlUGVtUGFyYW1ldGVyXCJcbiAgICApXG4gICAgdGhpcy5wcml2YXRlS2V5U2VjcmV0UGFyYW1ldGVyID0gY3VzdG9tUmVzb3VyY2UuZ2V0QXR0U3RyaW5nKFxuICAgICAgXCJQcml2YXRlS2V5U2VjcmV0UGFyYW1ldGVyXCJcbiAgICApXG4gICAgdGhpcy50aGluZ0FybiA9IGN1c3RvbVJlc291cmNlLmdldEF0dFN0cmluZyhcIlRoaW5nQXJuXCIpXG4gICAgdGhpcy5pb3RQb2xpY3lBcm4gPSBjdXN0b21SZXNvdXJjZS5nZXRBdHRTdHJpbmcoXCJJb3RQb2xpY3lBcm5cIilcbiAgICB0aGlzLmNlcnRpZmljYXRlQXJuID0gY3VzdG9tUmVzb3VyY2UuZ2V0QXR0U3RyaW5nKFwiQ2VydGlmaWNhdGVBcm5cIilcbiAgICB0aGlzLmRhdGFBdHNFbmRwb2ludEFkZHJlc3MgPSBjdXN0b21SZXNvdXJjZS5nZXRBdHRTdHJpbmcoXG4gICAgICBcIkRhdGFBdHNFbmRwb2ludEFkZHJlc3NcIlxuICAgIClcbiAgICB0aGlzLmNyZWRlbnRpYWxQcm92aWRlckVuZHBvaW50QWRkcmVzcyA9IGN1c3RvbVJlc291cmNlLmdldEF0dFN0cmluZyhcbiAgICAgIFwiQ3JlZGVudGlhbFByb3ZpZGVyRW5kcG9pbnRBZGRyZXNzXCJcbiAgICApXG4gIH1cblxuICAvLyBTZXBhcmF0ZSBzdGF0aWMgZnVuY3Rpb24gdG8gY3JlYXRlIG9yIHJldHVybiBzaW5nbGV0b24gcHJvdmlkZXJcbiAgc3RhdGljIGdldE9yQ3JlYXRlUHJvdmlkZXIgPSAoXG4gICAgc2NvcGU6IENvbnN0cnVjdCxcbiAgICByZXNvdXJjZU5hbWU6IHN0cmluZ1xuICApOiBjci5Qcm92aWRlciA9PiB7XG4gICAgY29uc3Qgc3RhY2sgPSBjZGsuU3RhY2sub2Yoc2NvcGUpXG4gICAgY29uc3QgdW5pcXVlSWQgPSByZXNvdXJjZU5hbWVcbiAgICBjb25zdCBleGlzdGluZyA9IHN0YWNrLm5vZGUudHJ5RmluZENoaWxkKHVuaXF1ZUlkKSBhcyBjci5Qcm92aWRlclxuXG4gICAgaWYgKGV4aXN0aW5nID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IGNyZWF0ZVRoaW5nRm4gPSBuZXcgUHl0aG9uRnVuY3Rpb24oc3RhY2ssIGAke3VuaXF1ZUlkfS1Qcm92aWRlcmAsIHtcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi5cIiwgXCJhc3NldHNcIiksXG4gICAgICAgIGluZGV4OiBcInRoaW5nX2NlcnRfcG9saWN5LnB5XCIsXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzgsXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICB9KVxuICAgICAgLy8gUm9sZSBwZXJtaXNzaW9ucyBhcmUgaGFuZGxlZCBieSB0aGUgbWFpbiBjb25zdHJ1Y3RvclxuXG4gICAgICAvLyBDcmVhdGUgdGhlIHByb3ZpZGVyIHRoYXQgaW52b2tlcyB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAgICBjb25zdCBjcmVhdGVUaGluZ1Byb3ZpZGVyID0gbmV3IGNyLlByb3ZpZGVyKHN0YWNrLCB1bmlxdWVJZCwge1xuICAgICAgICBvbkV2ZW50SGFuZGxlcjogY3JlYXRlVGhpbmdGbixcbiAgICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX0RBWSxcbiAgICAgIH0pXG4gICAgICByZXR1cm4gY3JlYXRlVGhpbmdQcm92aWRlclxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBTZWNvbmQgb3IgYWRkaXRpb25hbCBjYWxsLCB1c2UgZXhpc3RpbmcgcHJvdmlkZXJcbiAgICAgIHJldHVybiBleGlzdGluZ1xuICAgIH1cbiAgfVxufVxuIl19