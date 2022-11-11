package packet

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
)

// details telemetry (event type 6) for all the cars in the race

type carTelemetryData struct {
	M_speed                   uint16     // Speed of car in kilometres per hour
	M_throttle                float32    // Amount of throttle applied (0.0 to 1.0)
	M_steer                   float32    // Steering (-1.0 (full lock left) to 1.0 (full lock right))
	M_brake                   float32    // Amount of brake applied (0.0 to 1.0)
	M_clutch                  uint8      // Amount of clutch applied (0 to 100)
	M_gear                    int8       // Gear selected (1-8, N=0, R=-1)
	M_engineRPM               uint16     // Engine RPM
	M_drs                     uint8      // 0 = off, 1 = on
	M_revLightsPercent        uint8      // Rev lights indicator (percentage)
	M_revLightsBitValue       uint16     // Rev lights (bit 0 = leftmost LED, bit 14 = rightmost LED)
	M_brakesTemperature       [4]uint16  // Brakes temperature (celsius)
	M_tyresSurfaceTemperature [4]uint8   // Tyres surface temperature (celsius)
	M_tyresInnerTemperature   [4]uint8   // Tyres inner temperature (celsius)
	M_engineTemperature       uint16     // Engine temperature (celsius)
	M_tyresPressure           [4]float32 // Tyres pressure (PSI)
	M_surfaceType             [4]uint8   // Driving surface, see appendices

}

type pktTelemetryData struct {
	PacketHeader     pktHeader            // fixed packet header (event type will be 0)
	CarTelemetryData [22]carTelemetryData // data for all cars on track

	// Extra player car ONLY data
	M_mfdPanelIndex uint8 // Index of MFD panel open - 255 = MFD closed
	// Single player, race – 0 = Car setup, 1 = Pits
	// 2 = Damage, 3 =  Engine, 4 = Temperatures
	// May vary depending on game mode
	M_mfdPanelIndexSecondaryPlayer uint8 // See above
	M_suggestedGear                int8  // Suggested gear for the player (1-8)
	// 0 if no gear suggested

}

// This is just the players data minus the header and other cars
type PlayerTelemetryData struct {
	CarTelemetryData carTelemetryData
}

func TelemetryPacket(pkt []byte) (pktTelemetryData, error) {
	var telemetryData pktTelemetryData

	// create reader and read packet
	wrappedReader := bytes.NewReader(pkt[:1347])
	err := binary.Read(wrappedReader, binary.LittleEndian, &telemetryData)
	if err != nil {
		fmt.Println(err)
	}
	if telemetryData.PacketHeader.M_packetId != 6 {
		fmt.Print("Not a telemetry packet")
		return telemetryData, errors.New("not a telemetry packet")
	} else {
		return telemetryData, nil
	}
}

func PlayerData(fullTelem pktTelemetryData) (PlayerTelemetryData, error) {
	var playerIndex int8
	var playerTelem PlayerTelemetryData

	if fullTelem.PacketHeader.M_packetId != 6 {
		fmt.Print("Not a telemetry packet")
		return playerTelem, errors.New("not a telemetry packet")
	} else {
		// Get player's index then copy the data
		playerIndex = int8(fullTelem.PacketHeader.M_playerCarIndex)
		playerTelem.CarTelemetryData = fullTelem.CarTelemetryData[playerIndex]

		return playerTelem, nil
	}
}
