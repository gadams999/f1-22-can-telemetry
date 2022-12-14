/**
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use
 * this file except in compliance with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under the License.
 **/
import * as seedrandom from "seedrandom"
import * as path from "path"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as iam from "aws-cdk-lib/aws-iam"
import * as timestream from "aws-cdk-lib/aws-timestream"
import * as cdk from "aws-cdk-lib"
import { Fn } from "aws-cdk-lib"
import { NagSuppressions } from "cdk-nag"
import { Construct } from "constructs"
import { IotThingCertPolicy } from "../../cdk-constructs/IotThingCertPolicy"
import { Asset } from "aws-cdk-lib/aws-s3-assets"
import * as fleetwise from "cdk-aws-iotfleetwise"
import * as constants from "./constants"
import * as util from "./utils"
import { exit } from "process"

export class F122TelemetryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // TODO - uncomment and provide descriptive prompt as to what will happen, pre-reqs, etc.
    // const promptResponse = util.prompt(
    //   "WARNING: Stack is a production stack. Continue? (y/n*): "
    // )
    // if (promptResponse.toLowerCase().trim() !== "y") {
    //   process.exit(1)
    // }

    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-S1",
        reason:
          "Access to stack logging bucket does not require separate logging for demonstrations. For production, this should be addressed in all stack S3 buckets.",
      },
    ])

    const stackName = cdk.Stack.of(this).stackName
    if (stackName.length > 20) {
      console.error("Stack name must be less than 20 characters in length")
      process.exitCode = 1
    }
    const stackRandom: string = util.makeId(8, stackName)

    // Create AWS IoT thing/cert/policy
    const fleetWiseCoreThingName = util.fullResourceName({
      stackName: stackName,
      baseName: "f1-car",
      suffix: stackRandom,
      resourceRegex: "a-zA-Z0-9:_-",
      maxLength: 128,
    })
    const fleetWiseCoreIotPolicyName = util.fullResourceName({
      stackName: stackName,
      baseName: "f1-car-minimal-policy",
      suffix: stackRandom,
      resourceRegex: "\\w+=,.@-",
      maxLength: 128,
    })
    // Then create IoT thing, certificate/private key, and IoT Policy
    const iotThingCertPol = new IotThingCertPolicy(this, "FleetWiseTestCore", {
      thingName: fleetWiseCoreThingName,
      iotPolicyName: fleetWiseCoreIotPolicyName,
      iotPolicy: constants.fleetWiseMinimalIoTPolicy,
      encryptionAlgorithm: "RSA",
      policyParameterMapping: {
        region: cdk.Fn.ref("AWS::Region"),
        account: cdk.Fn.ref("AWS::AccountId"),
      },
    })

    // Create timestream DB for use by FleetWise
    const tsDatabase = new timestream.CfnDatabase(this, "TsDatabase", {
      databaseName: `f1-telemetry-${stackRandom}`,
    })
    const tsHeartBeatTable = new timestream.CfnTable(this, "HeartbeatTable", {
      databaseName: tsDatabase.ref,
      tableName: "fleetwise",
      retentionProperties: {
        MemoryStoreRetentionPeriodInHours: "24",
        MagneticStoreRetentionPeriodInDays: "2",
      },
    })

    // create IAM role for FleetWise to work with Timestream
    const fleetwiseServiceRole = new iam.Role(this, "FleetwiseServiceRole", {
      roleName: "f1-telemetry-fleetwise-service-role",
      assumedBy: new iam.ServicePrincipal("iotfleetwise.amazonaws.com"),
    })
    fleetwiseServiceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["timestream:WriteRecords", "timestream:Select"],
        resources: [
          `Arn:aws:timestream:${cdk.Fn.ref("AWS::Region")}:${cdk.Fn.ref(
            "AWS::AccountId"
          )}:database/${tsDatabase.ref}/*`,
        ],
      })
    )
    fleetwiseServiceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
      })
    )
    // Allow FleetWise to send logs to CloudWatch Logs
    fleetwiseServiceRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "IoTFleetwiseLoggingCWL",
        actions: [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups",
        ],
        resources: ["*"],
      })
    )

    NagSuppressions.addResourceSuppressions(
      fleetwiseServiceRole,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "Service-linked role required by FleetWise to interact with specific Timestream DB/tables and emit CloudWatch metrics",
        },
      ],
      true
    )

    // Enable Fleetwise logging for errors
    new fleetwise.Logging(this, "FleetWiseLogging", {
      logGroupName: "AWSIotFleetWiseLogsV1",
      enableLogging: "ERROR",
    })

    // Start the catalog with top level branches for vehicle data
    // OBD-like data will use signals in Vehicle.OBD while custom
    // signals will be in Vehicle.FormulaOne
    const signalNodes: fleetwise.SignalCatalogSensor[] = [
      // Parent of all signals and branches
      new fleetwise.SignalCatalogBranch({
        fullyQualifiedName: "Vehicle",
        description: "All vehicle signals",
      }),
      // Parent branch for VSS file containing COVESA standard OBD.vspec
      new fleetwise.SignalCatalogBranch({
        fullyQualifiedName: "Vehicle.OBD",
        description: "OBDII standard signals",
      }),
      new fleetwise.SignalCatalogBranch({
        fullyQualifiedName: "Vehicle.FormulaOne",
        description: "Signals specific to F1 vehicles",
      }),
      new fleetwise.SignalCatalogSensor({
        fullyQualifiedName: "Vehicle.FormulaOne.Speed",
        description: "Speed from custom signal",
        dataType: "FLOAT",
        unit: "km/h",
      }),
      new fleetwise.SignalCatalogSensor({
        fullyQualifiedName: "Vehicle.FormulaOne.FuelCapacity",
        description: "Fuel capacity",
        dataType: "FLOAT",
        unit: "l",
      }),
      new fleetwise.SignalCatalogSensor({
        fullyQualifiedName: "Vehicle.FormulaOne.FuelInTank",
        description: "Fuel mass in tank",
        dataType: "FLOAT",
        unit: "l",
      }),
      new fleetwise.SignalCatalogAttribute({
        fullyQualifiedName: "Manufacturer",
        dataType: "STRING",
      }),
      new fleetwise.SignalCatalogAttribute({
        fullyQualifiedName: "ModelYear",
        dataType: "STRING",
      }),
    ]

    const signalCatalog = new fleetwise.SignalCatalog(this, "SignalCatalog", {
      description: "Testing stuff",
      database: tsDatabase,
      table: tsHeartBeatTable,
      nodes: signalNodes,
      vssFile: path.join(__dirname, "..", "assets", "OBD.vspec"),
      vssPrefix: "Vehicle.OBD",
      vssGeneratePrefixBranch: false,
    })
    signalCatalog.node.addDependency(fleetwiseServiceRole)

    // cdk-iot-fleetwise
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      [
        `/${this.stackName}/signalcataloghandler.on_event-provider/Provider/framework-onEvent/Resource`,
        // This suppresses onEvent, isComplete, and onTimeout children if you don't want to specify them all
        `/${this.stackName}/servicehandler.on_event-provider/Provider`,
      ],
      [
        {
          id: "AwsSolutions-L1",
          reason:
            "CDK uses an older version of Node for custom resource provider. Maintained by CDK",
        },
      ],
      true
    )
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      [
        `/${this.stackName}/handler-role/Role/Resource`,
        `/${this.stackName}/servicehandler.on_event-provider/Provider`,
        `/${this.stackName}/signalcataloghandler.on_event-provider/Provider`,
      ],
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "Lambda basic execution managed policy and custom resource provider",
        },
        {
          id: "AwsSolutions-IAM5",
          reason: "Resource permissions suitable for stack creation/deletion",
        },
      ],
      true
    )

    // Create vehicle manifest
    const f1VehicleModelA = new fleetwise.VehicleModel(
      this,
      "F1VehicleModelA",
      {
        signalCatalog: signalCatalog,
        name: "F1_22_Vehicle",
        description: "F1 22 vehicle model specification",
        networkInterfaces: [
          new fleetwise.CanVehicleInterface({
            interfaceId: "1",
            name: "vcan0",
          }),
        ],
        signals: [
          new fleetwise.CanVehicleSignal({
            fullyQualifiedName: "Vehicle.OBD.Speed",
            interfaceId: "1",
            messageId: 1024,
            factor: 1.0,
            isBigEndian: true,
            isSigned: false,
            length: 8,
            offset: 0.0,
            startBit: 0,
          }),
          new fleetwise.CanVehicleSignal({
            fullyQualifiedName: "Vehicle.FormulaOne.Speed",
            interfaceId: "1",
            messageId: 1025,
            factor: 0.1,
            isBigEndian: true,
            isSigned: false,
            length: 16,
            offset: 0.0,
            startBit: 8,
          }),
          new fleetwise.CanVehicleSignal({
            fullyQualifiedName: "Vehicle.OBD.EngineSpeed",
            interfaceId: "1",
            messageId: 1026,
            factor: 0.25,
            isBigEndian: true,
            isSigned: false,
            length: 16,
            offset: 0.0,
            startBit: 8,
          }),
          new fleetwise.CanVehicleSignal({
            fullyQualifiedName: "Vehicle.OBD.ThrottlePosition",
            interfaceId: "1",
            messageId: 1027,
            factor: 0.39215686274,
            isBigEndian: true,
            isSigned: false,
            length: 8,
            offset: 0.0,
            startBit: 0,
          }),
          new fleetwise.CanVehicleSignal({
            fullyQualifiedName: "Vehicle.OBD.CoolantTemperature",
            interfaceId: "1",
            messageId: 1028,
            factor: 1.0,
            isBigEndian: true,
            isSigned: false,
            length: 8,
            offset: -40.0,
            startBit: 0,
          }),
          new fleetwise.CanVehicleSignal({
            fullyQualifiedName: "Vehicle.FormulaOne.FuelCapacity",
            interfaceId: "1",
            messageId: 1029,
            factor: 0.01,
            isBigEndian: true,
            isSigned: false,
            length: 16,
            offset: 0.0,
            startBit: 8,
          }),
          new fleetwise.CanVehicleSignal({
            fullyQualifiedName: "Vehicle.FormulaOne.FuelInTank",
            interfaceId: "1",
            messageId: 1030,
            factor: 0.01,
            isBigEndian: true,
            isSigned: false,
            length: 16,
            offset: 0.0,
            startBit: 8,
          }),
          new fleetwise.AttributeVehicleSignal({
            fullyQualifiedName: "Manufacturer",
          }),
          new fleetwise.AttributeVehicleSignal({
            fullyQualifiedName: "ModelYear",
          }),
        ],
      }
    )

    const vinF1Vehicle = new fleetwise.Vehicle(this, "VinF1Vehicle", {
      vehicleName: fleetWiseCoreThingName,
      vehicleModel: f1VehicleModelA,
      createIotThing: false,
      attributes: {
        Manufacturer: "EA Sports",
        ModelYear: "2022",
      },
    })
    vinF1Vehicle.node.addDependency(iotThingCertPol)

    const campaign = new fleetwise.Campaign(this, "VehicleCampaign", {
      name: "TimeBasedCollection",
      target: vinF1Vehicle,
      autoApprove: true,
      collectionScheme: new fleetwise.TimeBasedCollectionScheme(
        cdk.Duration.seconds(10)
      ),
      signals: [
        new fleetwise.CampaignSignal("Vehicle.OBD.Speed"),
        new fleetwise.CampaignSignal("Vehicle.FormulaOne.Speed"),
        new fleetwise.CampaignSignal("Vehicle.OBD.EngineSpeed"),
        new fleetwise.CampaignSignal("Vehicle.OBD.ThrottlePosition"),
        new fleetwise.CampaignSignal("Vehicle.OBD.CoolantTemperature"),
        new fleetwise.CampaignSignal("Vehicle.FormulaOne.FuelCapacity"),
        new fleetwise.CampaignSignal("Vehicle.FormulaOne.FuelInTank"),
      ],
    })

    const logFileBucket = new s3.Bucket(this, "LogFileBucket", {
      bucketName: `${stackName}-logfiles-${cdk.Fn.ref(
        "AWS::AccountId"
      )}-${cdk.Fn.ref("AWS::Region")}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
      encryption: s3.BucketEncryption.S3_MANAGED,
      intelligentTieringConfigurations: [
        {
          name: "archive",
          archiveAccessTierTime: cdk.Duration.days(90),
          deepArchiveAccessTierTime: cdk.Duration.days(180),
        },
      ],
    })

    const vpcFlowLogRole = new iam.Role(this, "VpcFlowLogRole", {
      assumedBy: new iam.ServicePrincipal("vpc-flow-logs.amazonaws.com"),
    })
    logFileBucket.grantWrite(vpcFlowLogRole, "sharedVpcFlowLogs/*")
    NagSuppressions.addResourceSuppressions(
      vpcFlowLogRole,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "VPC Flow Logs are limited to the prefix 'sharedVpcFlowLogs' for writing to logFileBucket",
        },
      ],
      true
    )

    const vpc = new ec2.Vpc(this, "listenerVpc", {
      ipAddresses: ec2.IpAddresses.cidr("172.31.0.0/16"),
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public-1",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    })

    // Create flow logs to S3
    const vpcFlowLogs = new ec2.FlowLog(this, "SharedVpcFlowLogs", {
      destination: ec2.FlowLogDestination.toS3(
        logFileBucket,
        "sharedVpcFlowLogs/"
      ),
      trafficType: ec2.FlowLogTrafficType.ALL,
      flowLogName: "sharedVpcFlowLogs",
      resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
    }).node.addDependency(vpcFlowLogRole)
    // Create security group for instance
    const instanceSG = new ec2.SecurityGroup(this, "InstanceSG", {
      vpc,
      allowAllOutbound: true,
    })
    // TODO - remove SSH access once development is done
    instanceSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH access from anywhere"
    )
    instanceSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udp(22222),
      "Allow UDP for telemetry listener from anywhere"
    )
    NagSuppressions.addResourceSuppressions(
      instanceSG,
      [
        {
          id: "AwsSolutions-EC23",
          reason: "temporary until SSM access working",
        },
      ],
      true
    )

    // Create a role for the instance
    const instanceRole = new iam.Role(this, "InstanceRole", {
      roleName: "f1-telemetry-instance-profile",
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    })
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:DescribeParameters"],
        resources: ["*"],
      })
    )
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:${cdk.Fn.ref("AWS::Region")}:${cdk.Fn.ref(
            "AWS::AccountId"
          )}:parameter/${stackName}/${fleetWiseCoreThingName}/*`,
        ],
      })
    )

    NagSuppressions.addResourceSuppressions(
      instanceRole,
      [
        {
          id: "AwsSolutions-IAM4",
          reason: "Managed policies are adequate for SSM access",
        },
      ],
      true
    )

    // ec2 details for building
    const telemetryInstance = new ec2.Instance(this, "TelemetryInstance", {
      instanceName: "telemetry-instance",
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        // TODO - set to SMALL when done developing
        ec2.InstanceSize.MEDIUM
      ),
      machineImage: ec2.MachineImage.fromSsmParameter(
        "/aws/service/canonical/ubuntu/server/22.04/stable/current/arm64/hvm/ebs-gp2/ami-id"
      ),
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: ec2.BlockDeviceVolume.ebs(40),
        },
      ],
      role: instanceRole,
      securityGroup: instanceSG,
      // TODO - remove once dev is done
      keyName: "gadams-us-east-1",
    })
    NagSuppressions.addResourceSuppressions(
      telemetryInstance,
      [
        {
          id: "AwsSolutions-EC28",
          reason: "Single short-lived instance",
        },
        {
          id: "AwsSolutions-EC29",
          reason: "Single short-lived instance",
        },
      ],
      true
    )

    // userData script - create assets, then download and run
    const userDataAssets = new Asset(this, "UserDataAssets", {
      path: path.join(__dirname, "..", "assets"),
    })
    userDataAssets.grantRead(instanceRole)

    // telemetry and supporting code
    const f1TelemetryAssets = new Asset(this, "F1TelemetryAssets", {
      path: path.join(__dirname, "..", "..", "f1telem"),
    })
    f1TelemetryAssets.grantRead(instanceRole)

    telemetryInstance.userData.addCommands(
      "set -xe",
      `export STACK_NAME="${Fn.ref("AWS::StackName")}"`,
      `export REGION="${Fn.ref("AWS::Region")}"`,
      "export INSTANCE_NAME=TelemetryInstance",
      `export SSM_CERT="${iotThingCertPol.certificatePemParameter}"`,
      `export SSM_KEY="${iotThingCertPol.privateKeySecretParameter}"`,
      `export IOT_ENDPOINT="${iotThingCertPol.dataAtsEndpointAddress}"`,
      `export THING_NAME="${fleetWiseCoreThingName}"`,
      "apt update && DEBIAN_FRONTEND=noninteractive apt -y upgrade",
      "DEBIAN_FRONTEND=noninteractive apt install -y awscli zip unzip net-tools"
    )
    telemetryInstance.userData.addS3DownloadCommand({
      bucket: userDataAssets.bucket,
      bucketKey: userDataAssets.s3ObjectKey,
      localFile: "/tmp/assets.zip",
    })
    telemetryInstance.userData.addS3DownloadCommand({
      bucket: f1TelemetryAssets.bucket,
      bucketKey: f1TelemetryAssets.s3ObjectKey,
      localFile: "/tmp/f1telem.zip",
    })
    telemetryInstance.userData.addCommands(
      "cd /tmp",
      "unzip assets.zip",
      "cp init-instance /usr/share/init-instance",
      "chmod +x /usr/share/init-instance",
      "/usr/share/init-instance",
      "cp edge-software-deploy /home/ubuntu/edge-software-deploy",
      "chmod +x /home/ubuntu/edge-software-deploy",
      "sudo -H -u ubuntu REGION=$REGION SSM_CERT=$SSM_CERT SSM_KEY=$SSM_KEY IOT_ENDPOINT=$IOT_ENDPOINT THING_NAME=$THING_NAME /home/ubuntu/edge-software-deploy"
      // add signal on instance
    )
    NagSuppressions.addResourceSuppressions(
      instanceRole,
      [
        {
          id: "AwsSolutions-IAM5",
          reason: "Limit asset bucket to read only, used to download assets",
        },
      ],
      true
    )
  }
}
