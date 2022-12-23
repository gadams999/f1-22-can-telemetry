package packet

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
)

// Details for processing a motion (event type 0) packet

type carStatusData struct {
	M_tractionControl       uint8   // Traction control - 0 = off, 1 = medium, 2 = full
	M_antiLockBrakes        uint8   // 0 (off) - 1 (on)
	M_fuelMix               uint8   // Fuel mix - 0 = lean, 1 = standard, 2 = rich, 3 = max
	M_frontBrakeBias        uint8   // Front brake bias (percentage)
	M_pitLimiterStatus      uint8   // Pit limiter status - 0 = off, 1 = on
	M_fuelInTank            float32 // Current fuel mass
	M_fuelCapacity          float32 // Fuel capacity
	M_fuelRemainingLaps     float32 // Fuel remaining in terms of laps (value on MFD)
	M_maxRPM                uint16  // Cars max RPM, point of rev limiter
	M_idleRPM               uint16  // Cars idle RPM
	M_maxGears              uint8   // Maximum number of gears
	M_drsAllowed            uint8   // 0 = not allowed, 1 = allowed
	M_drsActivationDistance uint16  // 0 = DRS not available, non-zero - DRS will be available in [X] metres
	M_actualTyreCompound    uint8   // F1 Modern - 16 = C5, 17 = C4, 18 = C3, 19 = C2, 20 = C1
	// 7 = inter, 8 = wet
	// F1 Classic - 9 = dry, 10 = wet
	// F2 – 11 = super soft, 12 = soft, 13 = medium, 14 = hard
	// 15 = wet
	M_visualTyreCompound uint8 // F1 visual (can be different from actual compound)
	// 16 = soft, 17 = medium, 18 = hard, 7 = inter, 8 = wet
	// F1 Classic – same as above
	// F2 ‘19, 15 = wet, 19 – super soft, 20 = soft
	// 21 = medium , 22 = hard
	M_tyresAgeLaps    uint8 // Age in laps of the current set of tyres
	M_vehicleFiaFlags uint8 // -1 = invalid/unknown, 0 = none, 1 = green
	// 2 = blue, 3 = yellow, 4 = red
	M_ersStoreEnergy float32 // ERS energy store in Joules
	M_ersDeployMode  uint8   // ERS deployment mode, 0 = none, 1 = medium
	// 2 = hotlap, 3 = overtake
	M_ersHarvestedThisLapMGUK float32 // ERS energy harvested this lap by MGU-K
	M_ersHarvestedThisLapMGUH float32 // ERS energy harvested this lap by MGU-H
	M_ersDeployedThisLap      float32 // ERS energy deployed this lap
	M_networkPaused           uint8   // Whether the car is paused in a network game

}

type pktCarStatusData struct {
	PacketHeader  pktHeader         // fixed packet header (event type will be 5)
	CarStatusData [22]carStatusData // data for all cars on track
}

type PlayerStatusData struct {
	CarStatusData carStatusData
}

func StatusPacket(pkt []byte) (pktCarStatusData, error) {
	var statusData pktCarStatusData

	// create reader and read packet
	wrappedReader := bytes.NewReader(pkt[:1058])
	err := binary.Read(wrappedReader, binary.LittleEndian, &statusData)
	if err != nil {
		fmt.Println(err, " for data ", pkt)
	}
	if statusData.PacketHeader.M_packetId != 7 {
		fmt.Print("Not a status packet")
		return statusData, errors.New("not a status packet")
	} else {
		return statusData, nil
	}
}

func GetPlayerStatusData(fullStatus pktCarStatusData) (PlayerStatusData, error) {
	var playerIndex int8
	var playerStatus PlayerStatusData

	if fullStatus.PacketHeader.M_packetId != 7 {
		fmt.Print("Not a status packet")
		return playerStatus, errors.New("not a status packet")
	} else {
		// Get player's index then copy the data
		playerIndex = int8(fullStatus.PacketHeader.M_playerCarIndex)
		playerStatus.CarStatusData = fullStatus.CarStatusData[playerIndex]

		return playerStatus, nil
	}
}
