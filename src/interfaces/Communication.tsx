import Stop from "./Stop";
import Pathway from "./Pathway";
import Level from "./Level";
import Vehicle from "./Vehicle";
import VehicleBoarding from "./VehicleBoarding";

export default interface Communication {
	stops: Stop[];
	pathways: Pathway[];
	vehicleBoardings: VehicleBoarding[];

	levels: Level[];
	vehicles: Vehicle[];
}
