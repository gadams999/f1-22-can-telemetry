# f1-22-can-telemetry

Convert EA Sports F1 2022 telemetry to CAN formatted messages.

Objective is to take in telemetry, convert to CAN data, then define a VSS and present as unicast and broadcast to local services.

## To launch

1. Clone repo
1. From CDK, deploy stack (see README.md)

## Telemetry to CAN

All values are native CAN (not OBDII).

| F1 Telem       | Description  | F1 Values | CAN Id | Decode type       | Factor,offset [min/max] | Notes        |
| -------------- | ------------ | --------- | ------ | ----------------- | ----------------------- | ------------ |
| tel.m_speed    | Speed in kPH | 0-65535   | 0x400  | uint8             | 1,0 [0\|255]            | OBD2 mapping |
| tel.m_speed    | Speed in kPH | 0-65535   | 0xd0   | int16 / 100-65235 | 1,0                     | Cust value   |
| tel.m_egineRPM | Engine RPM   | 0-65535   | 0xc    | A =               |                         |
|                |              |           |        |                   |                         |
