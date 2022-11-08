package packet

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
)

// Details for processing a motion (event type 0) packet

type carMotionData struct {
	M_worldPositionX     float32 // World space X position
	M_worldPositionY     float32 // World space Y position
	M_worldPositionZ     float32 // World space Z position
	M_worldVelocityX     float32 // Velocity in world space X
	M_worldVelocityY     float32 // Velocity in world space Y
	M_worldVelocityZ     float32 // Velocity in world space Z
	M_worldForwardDirX   int16   // World space forward X direction (normalised)
	M_worldForwardDirY   int16   // World space forward Y direction (normalised)
	M_worldForwardDirZ   int16   // World space forward Z direction (normalised)
	M_worldRightDirX     int16   // World space right X direction (normalised)
	M_worldRightDirY     int16   // World space right Y direction (normalised)
	M_worldRightDirZ     int16   // World space right Z direction (normalised)
	M_gForceLateral      float32 // Lateral G-Force component
	M_gForceLongitudinal float32 // Longitudinal G-Force component
	M_gForceVertical     float32 // Vertical G-Force component
	M_yaw                float32 // Yaw angle in radians
	M_pitch              float32 // Pitch angle in radians
	M_roll               float32 // Roll angle in radians
}

type pktMotionData struct {
	PacketHeader  pktHeader         // fixed packet header (event type will be 0)
	CarMotionData [22]carMotionData // data for all cars on track

	// Extra player car ONLY data
	M_suspensionPosition     [4]float32 // Note: All wheel arrays have the following order:
	M_suspensionVelocity     [4]float32 // RL, RR, FL, FR
	M_suspensionAcceleration [4]float32 // RL, RR, FL, FR
	M_wheelSpeed             [4]float32 // Speed of each wheel
	M_wheelSlip              [4]float32 // Slip ratio for each wheel
	M_localVelocityX         float32    // Velocity in local space
	M_localVelocityY         float32    // Velocity in local space
	M_localVelocityZ         float32    // Velocity in local space
	M_angularVelocityX       float32    // Angular velocity x-component
	M_angularVelocityY       float32    // Angular velocity y-component
	M_angularVelocityZ       float32    // Angular velocity z-component
	M_angularAccelerationX   float32    // Angular velocity x-component
	M_angularAccelerationY   float32    // Angular velocity y-component
	M_angularAccelerationZ   float32    // Angular velocity z-component
	M_frontWheelsAngle       float32    // Current front wheels angle in radians
}

func MotionPacket(pkt []byte) (pktMotionData, error) {
	var motionData pktMotionData

	// create reader and read packet
	wrappedReader := bytes.NewReader(pkt[:1464])
	err := binary.Read(wrappedReader, binary.LittleEndian, &motionData)
	if err != nil {
		fmt.Println(err)
	}
	if motionData.PacketHeader.M_packetId != 0 {
		fmt.Print("Not a motion packet")
		return motionData, errors.New("")
	} else {
		return motionData, nil
	}
}
