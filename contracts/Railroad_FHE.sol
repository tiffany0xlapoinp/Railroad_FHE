pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract RailroadTycoonFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error InvalidBatch();
    error BatchClosed();
    error StaleWrite();
    error ReplayAttempt();
    error InvalidStateHash();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event CooldownUpdated(uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId, uint256 openedAt);
    event BatchClosed(uint256 indexed batchId, uint256 closedAt);
    event CargoSubmitted(
        address indexed provider,
        uint256 indexed batchId,
        bytes32 cargoDemandCt,
        bytes32 cargoSupplyCt,
        bytes32 routeProfitCt
    );
    event DecryptionRequested(
        uint256 indexed requestId,
        uint256 indexed batchId,
        bytes32 stateHash
    );
    event DecryptionComplete(
        uint256 indexed requestId,
        uint256 indexed batchId,
        uint256 totalDemand,
        uint256 totalSupply,
        uint256 totalProfit
    );

    bool public paused;
    uint256 public constant MIN_INTERVAL = 5 seconds;
    uint256 public cooldownInterval = 10 seconds;
    uint256 public currentBatchId;
    uint256 public currentModelVersion;

    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastActionAt;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    struct EncryptedCargo {
        euint32 demand;
        euint32 supply;
        euint32 profit;
    }

    struct Batch {
        bool isActive;
        uint256 modelVersion;
        uint256 openedAt;
        uint256 closedAt;
        uint256 submissionCount;
        euint32 totalDemand;
        euint32 totalSupply;
        euint32 totalProfit;
        mapping(address => bool) hasSubmitted;
    }

    struct DecryptionContext {
        uint256 batchId;
        uint256 modelVersion;
        bytes32 stateHash;
        bool processed;
        address requester;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkCooldown() {
        if (block.timestamp < lastActionAt[msg.sender] + cooldownInterval) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        currentModelVersion = 1;
        _openNewBatch();
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldownInterval(uint256 newInterval) external onlyOwner {
        require(newInterval >= MIN_INTERVAL, "Cooldown too short");
        cooldownInterval = newInterval;
        emit CooldownUpdated(newInterval);
    }

    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        isProvider[provider] = false;
        emit ProviderRemoved(provider);
    }

    function openNewBatch() external onlyOwner {
        _openNewBatch();
    }

    function closeCurrentBatch() external onlyOwner {
        Batch storage batch = batches[currentBatchId];
        if (!batch.isActive) revert InvalidBatch();
        batch.isActive = false;
        batch.closedAt = block.timestamp;
        emit BatchClosed(currentBatchId, block.timestamp);
    }

    function submitEncryptedCargo(
        euint32 demand,
        euint32 supply,
        euint32 profit
    ) external onlyProvider whenNotPaused checkCooldown {
        lastActionAt[msg.sender] = block.timestamp;

        Batch storage batch = batches[currentBatchId];
        if (!batch.isActive) revert BatchClosed();
        if (batch.hasSubmitted[msg.sender]) revert ReplayAttempt();

        _requireInitialized(demand, "demand");
        _requireInitialized(supply, "supply");
        _requireInitialized(profit, "profit");

        batch.totalDemand = FHE.add(batch.totalDemand, demand);
        batch.totalSupply = FHE.add(batch.totalSupply, supply);
        batch.totalProfit = FHE.add(batch.totalProfit, profit);
        batch.submissionCount++;
        batch.hasSubmitted[msg.sender] = true;

        emit CargoSubmitted(
            msg.sender,
            currentBatchId,
            FHE.toBytes32(demand),
            FHE.toBytes32(supply),
            FHE.toBytes32(profit)
        );
    }

    function requestBatchDecryption(uint256 batchId) external whenNotPaused checkCooldown {
        lastActionAt[msg.sender] = block.timestamp;

        Batch storage batch = batches[batchId];
        if (batch.modelVersion != currentModelVersion) revert StaleWrite();

        euint32 memory totalDemand = _initIfNeeded(batch.totalDemand);
        euint32 memory totalSupply = _initIfNeeded(batch.totalSupply);
        euint32 memory totalProfit = _initIfNeeded(batch.totalProfit);

        bytes32[] memory cts = new bytes32[](3);
        cts[0] = FHE.toBytes32(totalDemand);
        cts[1] = FHE.toBytes32(totalSupply);
        cts[2] = FHE.toBytes32(totalProfit);

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.finalizeBatchDecryption.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            modelVersion: batch.modelVersion,
            stateHash: stateHash,
            processed: false,
            requester: msg.sender
        });

        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function finalizeBatchDecryption(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        DecryptionContext storage context = decryptionContexts[requestId];
        if (context.processed) revert ReplayAttempt();

        Batch storage batch = batches[context.batchId];
        if (batch.modelVersion != context.modelVersion) revert StaleWrite();

        euint32 memory totalDemand = _initIfNeeded(batch.totalDemand);
        euint32 memory totalSupply = _initIfNeeded(batch.totalSupply);
        euint32 memory totalProfit = _initIfNeeded(batch.totalProfit);

        bytes32[] memory currentCts = new bytes32[](3);
        currentCts[0] = FHE.toBytes32(totalDemand);
        currentCts[1] = FHE.toBytes32(totalSupply);
        currentCts[2] = FHE.toBytes32(totalProfit);

        bytes32 currentStateHash = _hashCiphertexts(currentCts);
        if (currentStateHash != context.stateHash) revert InvalidStateHash();

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint256 demandValue = abi.decode(cleartexts, (uint256));
        uint256 supplyValue = abi.decode(cleartexts, (uint256));
        uint256 profitValue = abi.decode(cleartexts, (uint256));

        context.processed = true;
        emit DecryptionComplete(requestId, context.batchId, demandValue, supplyValue, profitValue);
    }

    function _openNewBatch() internal {
        currentBatchId++;
        Batch storage newBatch = batches[currentBatchId];
        newBatch.isActive = true;
        newBatch.modelVersion = currentModelVersion;
        newBatch.openedAt = block.timestamp;
        newBatch.totalDemand = FHE.asEuint32(0);
        newBatch.totalSupply = FHE.asEuint32(0);
        newBatch.totalProfit = FHE.asEuint32(0);
        emit BatchOpened(currentBatchId, block.timestamp);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal pure returns (euint32 memory) {
        if (!FHE.isInitialized(x)) {
            return FHE.asEuint32(0);
        }
        return x;
    }

    function _requireInitialized(euint32 x, string memory tag) internal pure {
        if (!FHE.isInitialized(x)) {
            revert(string(abi.encodePacked("Uninitialized: ", tag)));
        }
    }
}