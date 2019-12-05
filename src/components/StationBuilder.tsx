import React, { Component } from 'react';
import './StationBuilder.scss';
import Vis from './Vis';
import StopDialog from './StopDialog';
import Stop from '../interfaces/Stop';
import VisNode from '../interfaces/VisNode';
import VisService from '../services/VisService';
import Communication from '../interfaces/Communication';
import Pathway, { PathwayModeMap } from '../interfaces/Pathway';
import VisEdge from '../interfaces/VisEdge';
import PathwayDialog from './PathwayDialog';
import cloneDeep from 'lodash/cloneDeep';
import Level from '../interfaces/Level';
import circleRedImage from '../images/circle-red.png';
import circleBlueImage from '../images/circle-blue.png';
import VehicleBoarding from '../interfaces/VehicleBoarding';
import DataService from '../services/DataService';

declare const google: any;

export interface StationBuilderProps {
	data: Communication,
	onSave: (data: Communication, deletedStopsIds: number[], deletedPathwaysIds: number[], deletedVehicleBoardingsIds: string[]) => void,
	onCancel: () => void,
	mapDiv?: HTMLDivElement,
	map?: google.maps.Map
}

export interface StationBuilderState {
	data: Communication,
	selectedStop: {
		stop: Stop,
		node: VisNode,
		callback: (node?: VisNode) => void
	} | null,
	selectedPathway: {
		pathway: Pathway,
		edge: VisEdge,
		callback: (edge?: VisEdge) => void
	} | null,
	mapMarkers: google.maps.Marker[],
	stations: Stop[],
	platforms: Stop[],
	levels: Level[],
	latK: number,
	latX: number,
	lonK: number,
	lonX: number,
	deletedStopsIds: number[],
	deletedPathwaysIds: number[]
}

export default class StationBuilder extends Component<StationBuilderProps, StationBuilderState> {
	private mapRef: React.RefObject<HTMLDivElement> = React.createRef();

	constructor(props: StationBuilderProps) {
		super(props);
		let stations: Stop[] = [];
		let platforms: Stop[] = [];
		props.data.stops.forEach((stop: Stop) => {
			if (stop.locationType === 0) {
				platforms.push(stop);
			}
			if (stop.locationType === 1) {
				stations.push(stop);
			}
		});
		if (stations.length === 0) {
			throw new Error("No station provided in input data");
		}
		if (platforms.length === 0) {
			throw new Error("No platforms provided in input data");
		}

		let minLat = 0;
		let minLon = 0;
		let maxLat = 0;
		let maxLon = 0;
		props.data.stops.forEach((stop: Stop) => {
			if (!minLat || (stop.stopLat < minLat)) {
				minLat = stop.stopLat;
			}
			if (!minLon || (stop.stopLon < minLon)) {
				minLon = stop.stopLon;
			}
			if (!maxLat || (stop.stopLat > maxLat)) {
				maxLat = stop.stopLat;
			}
			if (!maxLon || (stop.stopLon > maxLon)) {
				maxLon = stop.stopLon;
			}
		});
		let latGap = maxLat - minLat;
		let lonGap = maxLon - minLon;
		const lonK = 1000.0 / lonGap;
		const lonX = -minLon * 1000.0 / lonGap;
		const latK = -1000.0 / latGap;
		const latX = maxLat * 1000.0 / latGap;

		// Init VisService state
		VisService.edgeRoundness = {};

		this.state = {
			data: cloneDeep(props.data),
			selectedStop: null,
			selectedPathway: null,
			mapMarkers: [],
			stations,
			platforms,
			levels: props.data.levels,
			latK,
			latX,
			lonK,
			lonX,
			deletedStopsIds: [],
			deletedPathwaysIds: []
		};
	}

	public componentDidMount() {
		const bounds = new google.maps.LatLngBounds();
		this.props.data.stops.forEach((stop: Stop) => {
			bounds.extend({
				lat: stop.stopLat,
				lng: stop.stopLon
			});
		});

		let map: google.maps.Map;

		if (this.mapRef.current) {
			if (this.props.mapDiv && this.props.map) {
				this.mapRef.current.appendChild(this.props.mapDiv);
				this.props.map.fitBounds(bounds);
				map = this.props.map;
			}
			else {
				console.log("Google map initialized");
				map = new google.maps.Map(this.mapRef.current);
				map.fitBounds(bounds);
			}
		}

		this.props.data.stops.filter((stop: Stop) => {
			return [0, 2].includes(stop.locationType);
		}).forEach((stop: Stop) => {
			this.state.mapMarkers.push(new google.maps.Marker({
				map: map,
				position: {
					lat: stop.stopLat,
					lng: stop.stopLon
				},
				icon: stop.locationType === 0 ? circleBlueImage : circleRedImage
			}));
		});

		document.addEventListener('keydown', this.handleDocumentKeydown);
	}

	private handleDocumentKeydown = (e: KeyboardEvent) => {
		if (e.keyCode === 27) {
			this.handleDialogCancel();
		}
	}

	public componentWillUnmount() {
		this.state.mapMarkers.forEach((marker) => {
			marker.setMap(null);
		});
		document.removeEventListener('keydown', this.handleDocumentKeydown);
	}

	private handleStopAddMode = (node: VisNode, callback: (node?: VisNode) => void) => {
		node = VisService.prepareNewNode(node, this.state.stations, {
			latK: this.state.latK,
			latX: this.state.latX,
			lonK: this.state.lonK,
			lonX: this.state.lonX
		});
		this.setState({
			selectedStop: {
				stop: node.stop,
				node: node,
				callback: callback
			}
		});
	}

	private handleStopEditMode = (node: VisNode, callback: (node?: VisNode) => void) => {
		this.setState({
			selectedStop: {
				stop: node.stop,
				node: node,
				callback: callback
			}
		});
	}

	private handlePathwayAddMode = (edge: VisEdge, callback: (edge?: VisEdge) => void) => {
		edge = VisService.prepareNewEdge(edge);
		this.setState({
			selectedPathway: {
				pathway: edge.pathway,
				edge: edge,
				callback: callback
			}
		});
	}

	private handlePathwayEditMode = (edge: VisEdge, callback: (edge?: VisEdge) => void) => {
		this.setState({
			selectedPathway: {
				pathway: edge.pathway,
				edge: edge,
				callback: callback
			}
		});
	}

	private handleStopDialogApply = (stop: Stop, newVehicleBoardings: VehicleBoarding[]) => {
		if (this.state.selectedStop) {
			const data = this.state.data;
			const stopIndex = data.stops.findIndex(curStop => curStop.stopId === stop.stopId);
			if (stopIndex === -1) {
				data.stops.push(stop);
			}
			else {
				data.stops[stopIndex] = stop;
			}
			const node = VisService.attachStopToNode(stop, this.state.selectedStop.node);
			this.state.selectedStop.callback(node);
			data.vehicleBoardings = newVehicleBoardings;
			this.setState({
				selectedStop: null,
				data
			});
		}
	}

	private handlePathwayDialogApply = (pathway: Pathway) => {
		if (this.state.selectedPathway) {
			const data = this.state.data;
			const pathwayIndex = data.pathways.findIndex(curPathway => curPathway.pathwayId === pathway.pathwayId);
			if (pathwayIndex === -1) {
				data.pathways.push(pathway);
			}
			else {
				data.pathways[pathwayIndex] = pathway;
			}
			const edge = VisService.attachPathwayToEdge(pathway, this.state.selectedPathway.edge);
			this.state.selectedPathway.callback(edge);
			this.setState({
				selectedPathway: null,
				data
			});
		}
	}

	private handleItemDelete = (
		dataToDelete: { nodes: number[], edges: number[] },
		callback: (dataToDelete?: { nodes: number[], edges: number[] }) => void
	) => {
		const hasError = dataToDelete.nodes.some((nodeId: number) => {
			const stop: Stop | undefined = this.state.data.stops.find(stop => stop.stopId === nodeId);
			if (stop && ![3, 4].includes(stop.locationType)) {
				alert("You can't delete this location type");
				return true;
			}
			const stopIndex = this.state.data.stops.findIndex(stop => stop.stopId === nodeId);
			if (stopIndex !== -1) {
				this.state.data.stops.splice(stopIndex, 1);
				this.state.deletedStopsIds.push(nodeId);
			}
			return false;
		});
		if (hasError) {
			callback();
			return;
		}
		dataToDelete.edges.forEach((pathwayId: number) => {
			const pathwayIndex = this.state.data.pathways.findIndex(pathway => pathway.pathwayId === pathwayId);
			if (pathwayIndex !== -1) {
				this.state.data.pathways.splice(pathwayIndex, 1);
				this.state.deletedPathwaysIds.push(pathwayId);
			}
		});
		callback(dataToDelete);
	}

	private handleDialogCancel = () => {
		if (this.state.selectedStop) {
			this.state.selectedStop.callback();
			this.setState({
				selectedStop: null
			});
		}
		if (this.state.selectedPathway) {
			this.state.selectedPathway.callback();
			this.setState({
				selectedPathway: null
			});
		}
	}

	private handleSaveClick = () => {
		// Get deleted vehicleBoardings
		const oldVehicleBoardings = this.props.data.vehicleBoardings;
		const newVehicleBoardings = this.state.data.vehicleBoardings;
		let deletedVehicleBoardingsIds: string[] = oldVehicleBoardings.filter(oldVehicleBoarding => {
			const oldId = DataService.getVehicleBoardingId(oldVehicleBoarding);
			const index = newVehicleBoardings.findIndex(newVehicleBoarding => {
				return DataService.getVehicleBoardingId(newVehicleBoarding) === oldId;
			});
			return (index === -1);
		}).map(vehicleBoarding => DataService.getVehicleBoardingId(vehicleBoarding));

		this.props.onSave(this.state.data,
			this.state.deletedStopsIds,
			this.state.deletedPathwaysIds,
			deletedVehicleBoardingsIds);
	}

	private handleCancelClick = () => {
		this.props.onCancel();
	}

	private handleStopDragEnd = (nodeId: number, position: {x: number, y: number}) => {
		const stop: Stop | undefined = this.state.data.stops.find((stop: Stop) => {
			return stop.stopId === nodeId;
		});
		// Update position for generic nodes and boarding areas
		if (stop && [3, 4].includes(stop.locationType)) {
			stop.stopLat = ((position.y || 0) - this.state.latX) / this.state.latK;
			stop.stopLon = ((position.x || 0) - this.state.lonX) / this.state.lonK;
		}
	}

	private handleFareZoneAdd = (position: {x: number, y: number}, callback: (nodes: VisNode[], edges: VisEdge[]) => void) => {
		const node1: VisNode = VisService.prepareNewNode({
			x: position.x,
			y: position.y
		} as VisNode, this.state.stations, {
			latK: this.state.latK,
			latX: this.state.latX,
			lonK: this.state.lonK,
			lonX: this.state.lonX
		});
		this.state.data.stops.push(node1.stop);

		const node2: VisNode = VisService.prepareNewNode({
			x: position.x - 100,
			y: position.y
		} as VisNode, this.state.stations, {
			latK: this.state.latK,
			latX: this.state.latX,
			lonK: this.state.lonK,
			lonX: this.state.lonX
		});
		this.state.data.stops.push(node2.stop);

		let edge1: VisEdge = VisService.prepareNewEdge({
			from: node1.id,
			to: node2.id
		} as VisEdge);
		edge1.pathway.pathwayMode = PathwayModeMap['FareGate'];
		edge1.pathway.isBidirectional = false;
		edge1.pathway.traversalTime = 10;
		edge1 = VisService.attachPathwayToEdge(edge1.pathway, edge1);
		this.state.data.pathways.push(edge1.pathway);

		let edge2: VisEdge = VisService.prepareNewEdge({
			from: node2.id,
			to: node1.id
		} as VisEdge);
		edge2.pathway.pathwayMode = PathwayModeMap['ExitGate'];
		edge2.pathway.isBidirectional = false;
		edge2.pathway.traversalTime = 10;
		edge2 = VisService.attachPathwayToEdge(edge2.pathway, edge2);
		this.state.data.pathways.push(edge2.pathway);

		callback([node1, node2], [edge1, edge2]);
	}

	render() {
		return (
			<div className="station-builder">
				<div className="panel">
					<button className="save" onClick={this.handleSaveClick}>Save</button>
					<button className="cancel" onClick={this.handleCancelClick}>Cancel</button>
				</div>
				<div className="main">
					<div className="graph">
						<Vis
							data={this.state.data}
							onStopAdd={this.handleStopAddMode}
							onStopEdit={this.handleStopEditMode}
							onItemDelete={this.handleItemDelete}
							onStopDragEnd={this.handleStopDragEnd}
							onPathwayAdd={this.handlePathwayAddMode}
							onPathwayEdit={this.handlePathwayEditMode}
							onFareZoneAdd={this.handleFareZoneAdd}
							latK={this.state.latK}
							latX={this.state.latX}
							lonK={this.state.lonK}
							lonX={this.state.lonX}
							isDialogShown={!!(this.state.selectedStop || this.state.selectedPathway)}></Vis>

						{this.state.selectedStop && <StopDialog
							stop={this.state.selectedStop.stop}
							stations={this.state.stations}
							platforms={this.state.platforms}
							levels={this.state.levels}
							vehicles={this.state.data.vehicles}
							vehicleBoardings={this.state.data.vehicleBoardings}
							onCancel={this.handleDialogCancel}
							onApply={this.handleStopDialogApply}></StopDialog>}

						{this.state.selectedPathway && <PathwayDialog
							pathway={this.state.selectedPathway.pathway}
							onCancel={this.handleDialogCancel}
							onApply={this.handlePathwayDialogApply}></PathwayDialog>}
					</div>
					<div className="map" ref={this.mapRef}></div>
				</div>
				{(this.state.selectedStop || this.state.selectedPathway) && <div className="dialog-bg" onClick={this.handleDialogCancel}></div>}
			</div>
		);
	}
}
